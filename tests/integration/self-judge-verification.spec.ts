// @ts-nocheck
/**
 * Phase B 集成测试 —— 自评-外验闭环（self-judge × verification-gateway）。
 *
 * 覆盖目标（《架构设计.md》§6.4 Phase B 验收门禁）：
 *   G1. 自评-外验一致率 > 90%（自评未升级样本中被真值证实比例）
 *   G2. 校准误差 ≤ 0.15（|校准后置信度 − 真实结果| 均值）
 *   G3. 海市蜃楼检测：自评声称可自行负责却被真值驳斥 → 强制 human-confirm
 *   G4. fail-safe：无真值源 / 无复核人 → 不默认成功
 *   G5. 双通道原则：真值驳斥时，即使复核人同意也不得放行
 *
 * 运行：tsc 编译后纯 node 运行（底部 harness），后续迁 vitest 无需改动用例。
 */

// ---- 测试垫片（vitest 存在则复用，否则本地异步实现）----
const __localShim = typeof describe === 'undefined';
if (__localShim) {
  globalThis.__queue = [];
  globalThis.describe = (name, fn) => {
    globalThis.__suiteName = name;
    fn();
  };
  globalThis.it = (name, fn) => {
    globalThis.__queue.push({ name: `${globalThis.__suiteName ?? ''} > ${name}`, fn });
  };
  globalThis.expect = (actual) => ({
    toBe: (exp) => {
      if (actual !== exp) throw new Error(`期望 ${JSON.stringify(exp)}，实际 ${JSON.stringify(actual)}`);
    },
    toBeCloseTo: (exp, digits = 6) => {
      if (Math.abs(actual - exp) >= Math.pow(10, -digits) / 2) {
        throw new Error(`期望 ≈ ${exp}（精度 ${digits}），实际 ${actual}`);
      }
    },
    toBeGreaterThan: (exp) => {
      if (!(actual > exp)) throw new Error(`期望 > ${exp}，实际 ${actual}`);
    },
    toBeGreaterThanOrEqual: (exp) => {
      if (!(actual >= exp)) throw new Error(`期望 ≥ ${exp}，实际 ${actual}`);
    },
    toBeLessThanOrEqual: (exp) => {
      if (!(actual <= exp)) throw new Error(`期望 ≤ ${exp}，实际 ${actual}`);
    },
    toBeTruthy: () => {
      if (!actual) throw new Error(`期望真值，实际 ${JSON.stringify(actual)}`);
    },
    toBeUndefined: () => {
      if (actual !== undefined) throw new Error(`期望 undefined，实际 ${JSON.stringify(actual)}`);
    },
    toContain: (exp) => {
      if (!actual.includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${JSON.stringify(actual)}`);
    },
  });
}

import {
  createQianhangSelfJudge,
  judgeIntent,
} from '@members/business-layer/member-qianhang/self-judge/index.js';
import {
  createMemberSelfJudge
} from '@members/core-layer/member-grandmaster/self-judge/index.js';
import type { Candidate, JudgmentSignal } from '@shared/self-judge-kit';
import { ConfidenceCalibrator } from '../../architecture-kernel/02-云枢核心引擎/cloud-pivot-orchestrator/verification-gateway/confidence-calibrator.js';
import { CrossValidator } from '../../architecture-kernel/02-云枢核心引擎/cloud-pivot-orchestrator/verification-gateway/cross-validator.js';
import { VerificationGateway } from '../../architecture-kernel/02-云枢核心引擎/cloud-pivot-orchestrator/verification-gateway/gateway.js';
import { GroundTruthChecker } from '../../architecture-kernel/02-云枢核心引擎/cloud-pivot-orchestrator/verification-gateway/ground-truth-checker.js';
import { OracleRegistry } from '../../architecture-kernel/02-云枢核心引擎/cloud-pivot-orchestrator/verification-gateway/oracle-registry.js';
import type { VerificationRequest, VerificationResult } from '../../architecture-kernel/02-云枢核心引擎/types.js';

// ---- 模拟世界状态（oracle 背后的"真实世界"）----
const truthIntent = new Map<string, string>(); // traceId → 真实意图
const buildHealthy = new Map<string, boolean>(); // buildId → 构建是否通过
let seq = 0;
const nextTrace = (p: string) => `${p}-${(seq += 1)}`;

/** 构建被测网关：真值源探针 + 语枢·万物复核人。 */
function buildGateway() {
  const registry = new OracleRegistry();
  registry.register({ id: 'db-intent-log', kind: 'database', description: '意图落库记录' });
  registry.register({ id: 'ci-build-api', kind: 'api', description: 'CI 构建状态' });

  const gt = new GroundTruthChecker(registry);
  // 探针 1：主张 "intent:<label>@<traceId>" → 对照模拟世界
  gt.registerProbe('db-intent-log', (claim) => {
    const m = /^intent:([a-z]+)@(.+)$/.exec(claim);
    if (!m) return null;
    return truthIntent.get(m[2]) === m[1];
  });
  // 探针 2：主张 "quality:passed@<buildId>" → 对照构建状态
  gt.registerProbe('ci-build-api', (claim) => {
    const m = /^quality:passed@(.+)$/.exec(claim);
    if (!m) return null;
    return buildHealthy.get(m[1]) === true;
  });

  const xv = new CrossValidator();
  // 复核人（语枢·万物）：独立分析——意图是否与文本线索一致（此处以"无强烈反对"模拟）
  xv.registerReviewer('thinker', (signal: JudgmentSignal, req: VerificationRequest) => ({
    agrees: !/refute/.test(req.claim),
    confidence: 0.8,
    note: '万物独立分析',
  }));

  return new VerificationGateway({ groundTruth: gt, crossValidator: xv });
}

const qianhang = createQianhangSelfJudge();
const grandmaster = createMemberSelfJudge();

/** 千行意图判定 → 自评信号（__topLabel 仅供测试读取自评标签）。 */
function qhSignal(text: string, top: string, topScore: number, second: string, secondScore: number): JudgmentSignal {
  const candidates: Candidate[] = [
    { label: top, score: topScore },
    { label: second, score: secondScore },
  ];
  return judgeIntent(qianhang, {
    agent: 'qianhang',
    taskType: 'intent-classification',
    text,
    candidates,
    traceId: nextTrace('qh'),
  });
}

describe('Phase B · 自评-外验闭环（verification-gateway）', () => {
  it('T1 校准器：证实走 noisy-OR 上抬，驳斥强衰减', () => {
    const cal = new ConfidenceCalibrator();
    const sig = { agent: 'q', confidence: 0.9 } as JudgmentSignal;
    const ok: VerificationResult = { traceId: 't', verified: true, sources: ['s'], confidence: 0.75 };
    const bad: VerificationResult = { traceId: 't', verified: false, sources: ['s'], confidence: 0.8 };
    expect(cal.calibrate(sig, ok).confidence).toBeCloseTo(1 - 0.1 * 0.25);
    expect(cal.calibrate(sig, bad).confidence).toBeCloseTo(0.9 * 0.2);
  });

  it('T2 fail-safe：无探针命中 → 不默认成功', async () => {
    const gw = buildGateway();
    const r = await gw.adjudicate(
      { agent: 'q', confidence: 0.9, uncertaintySources: [], assumptions: [], escalation: 'none' },
      { traceId: 'x1', agent: 'q', claim: 'unknown:claim@x1' },
    );
    expect(r.effective.verified).toBe(false);
    expect(r.finalEscalation).toBe('human-confirm');
  });

  it('T3 fail-safe：无复核人 → 交叉验证不默认成功', async () => {
    const xv = new CrossValidator();
    const r = await xv.crossValidate({
      request: { traceId: 'x2', agent: 'q', claim: 'intent:analysis@x2' },
      signal: { agent: 'q', confidence: 0.5, uncertaintySources: [], assumptions: [], escalation: 'cross-validate' },
    });
    expect(r.verified).toBe(false);
    expect(r.detail).toContain('fail-safe');
  });

  it('T4 千行 6 例清晰意图：自评未升级 + 真值证实（一致率正向样本）', async () => {
    const gw = buildGateway();
    const cases: [string, string][] = [
      ['请分析这组销售数据', 'analysis'],
      ['帮我做一份对比报告', 'analysis'],
      ['预测下季度趋势', 'prediction'],
      ['推荐一台适合的笔记本', 'recommendation'],
      ['为活动写一句口号', 'creation'],
      ['请编排整体方案', 'orchestration'],
    ];
    for (const [text, label] of cases) {
      const sig = qhSignal(text, label, 0.9, 'chat', 0.05);
      (sig as any).__topLabel = label;
      expect(sig.escalation).toBe('none'); // 决定性差距 → 自评未升级
      const rec = await gw.adjudicate(sig, await intentRequest(gw, sig, label));
      expect(rec.effective.verified).toBe(true);
      expect(rec.finalEscalation).toBe('none');
      expect(rec.mirageSuspected).toBe(false);
      expect(rec.finalConfidence).toBeGreaterThan(0.9); // noisy-OR 上抬
    }
  });

  it('T5 千行 4 例次清晰意图：真值证实，校准后置信度抬升', async () => {
    const gw = buildGateway();
    const cases: [string, string][] = [
      ['看看这段数据说明什么', 'analysis'],
      ['猜测明年市场走向', 'prediction'],
      ['有什么适合我的方案吗', 'recommendation'],
      ['给这个产品起个名字', 'creation'],
    ];
    for (const [text, label] of cases) {
      const sig = qhSignal(text, label, 0.85, 'chat', 0.1);
      (sig as any).__topLabel = label;
      const rec = await gw.adjudicate(sig, await intentRequest(gw, sig, label));
      expect(rec.effective.verified).toBe(true);
      expect(rec.finalConfidence).toBeGreaterThanOrEqual(sig.confidence); // 证实 → 不降
    }
  });

  it('T6 千行歧义输入：升级 cross-validate → 万物复核支持 → 放行但留痕', async () => {
    const gw = buildGateway();
    // 置信度落点：base = 0.7*0.62 + 0.3*(0.17/0.3) ≈ 0.604 ∈ (人审线, tauLow=0.65) → cross-validate
    const sig = qhSignal('帮我梳理一下这组数据', 'analysis', 0.62, 'recommendation', 0.45);
    (sig as any).__topLabel = 'analysis';
    expect(sig.escalation).toBe('cross-validate'); // 低于 tauLow 但未到人审线 → 请家人复核
    const rec = await gw.adjudicate(sig, await intentRequest(gw, sig, 'analysis'));
    expect(rec.cross).toBeTruthy(); // 触发了交叉验证
    expect(rec.effective.verified).toBe(true); // 真值+复核双通道支持
  });

  it('T7 海市蜃楼：宗师自评构建通过，但 CI 真值为破 → 强制 human-confirm', async () => {
    const gw = buildGateway();
    const buildId = nextTrace('b');
    buildHealthy.set(buildId, false); // 真实世界：构建失败
    const sig = grandmaster.judge({
      agent: 'grandmaster',
      taskType: 'quality-judgment',
      candidates: [
        { label: 'passed', score: 0.88 },
        { label: 'failed', score: 0.05 },
      ],
      uncertaintySources: [],
    });
    expect(sig.escalation).toBe('none'); // 自评高置信、未升级
    const rec = await gw.adjudicate(sig, {
      traceId: buildId,
      agent: 'grandmaster',
      claim: `quality:passed@${buildId}`,
    });
    expect(rec.mirageSuspected).toBe(true); // 海市蜃楼被捕获
    expect(rec.effective.verified).toBe(false);
    expect(rec.finalEscalation).toBe('human-confirm'); // 红线：不放行
    expect(rec.finalConfidence).toBeLessThanOrEqual(0.25); // 驳斥强衰减
  });

  it('T8 双通道原则：真值驳斥时复核人同意也不能放行', async () => {
    const gw = buildGateway();
    const traceId = nextTrace('vf');
    truthIntent.set(traceId, 'prediction'); // 真实意图是 prediction
    const sig = qhSignal('分析一下', 'analysis', 0.9, 'chat', 0.05); // 自评 analysis（错）
    (sig as any).__topLabel = 'analysis';
    const rec = await gw.adjudicate(sig, {
      traceId,
      agent: 'qianhang',
      claim: `intent:analysis@${traceId}`,
    });
    expect(rec.groundTruth.verified).toBe(false);
    expect(rec.cross!.verified).toBe(true); // 复核人（模拟）同意
    expect(rec.effective.verified).toBe(false); // 但真值优先 → 不放行
    expect(rec.finalEscalation).toBe('human-confirm');
  });

  it('G1/G2/G3 门禁：一致率 > 90%，校准误差 ≤ 0.15，海市蜃楼 = 1', async () => {
    const gw = buildGateway();
    // 10 例自评未升级且真值证实
    for (let i = 0; i < 6; i += 1) {
      const sig = qhSignal(`案例${i} 请分析数据`, 'analysis', 0.9, 'chat', 0.05);
      (sig as any).__topLabel = 'analysis';
      await gw.adjudicate(sig, await intentRequest(gw, sig, 'analysis'));
    }
    for (let i = 0; i < 4; i += 1) {
      const sig = qhSignal(`案例${i} 预测走向`, 'prediction', 0.85, 'chat', 0.1);
      (sig as any).__topLabel = 'prediction';
      await gw.adjudicate(sig, await intentRequest(gw, sig, 'prediction'));
    }
    // 1 例宗师质量判定（真值证实）
    const bId = nextTrace('b');
    buildHealthy.set(bId, true);
    const gmOk = grandmaster.judge({
      agent: 'grandmaster',
      taskType: 'quality-judgment',
      candidates: [
        { label: 'passed', score: 0.9 },
        { label: 'failed', score: 0.05 },
      ],
    });
    await gw.adjudicate(gmOk, { traceId: bId, agent: 'grandmaster', claim: `quality:passed@${bId}` });
    // 1 例海市蜃楼（真值驳斥）
    const bBad = nextTrace('b');
    buildHealthy.set(bBad, false);
    const gmBad = grandmaster.judge({
      agent: 'grandmaster',
      taskType: 'quality-judgment',
      candidates: [
        { label: 'passed', score: 0.88 },
        { label: 'failed', score: 0.05 },
      ],
    });
    await gw.adjudicate(gmBad, { traceId: bBad, agent: 'grandmaster', claim: `quality:passed@${bBad}` });

    const snap = gw.metrics.snapshot();
    // G1：一致率 = 12 例自评未升级（含 1 例海市蜃楼）中 11 例被证实
    expect(snap.selfOkSamples).toBe(12);
    expect(snap.consistencyRate!).toBeGreaterThan(0.9);
    // G2：校准误差 ≤ 0.15
    expect(snap.calibrationError!).toBeLessThanOrEqual(0.15);
    // G3：海市蜃楼恰为 1
    expect(snap.mirageCount).toBe(1);
  });
});

/** 组装意图验证请求（claim 携带自评 top 标签 + 真值绑定 traceId）。 */
async function intentRequest(gw: VerificationGateway, signal: JudgmentSignal, claimed: string) {
  const traceId = nextTrace('vf');
  truthIntent.set(traceId, claimed); // 模拟世界记录真实意图
  void gw;
  return { traceId, agent: signal.agent, claim: `intent:${claimed}@${traceId}` } as VerificationRequest;
}

// ---- 纯 node 异步 harness（vitest 环境下不生效）----
if (__localShim) {
  (async () => {
    let passed = 0;
    let failed = 0;
    for (const c of globalThis.__queue) {
      try {
        await c.fn();
        passed += 1;
        console.log(`PASS  ${c.name}`);
      } catch (e) {
        failed += 1;
        console.log(`FAIL  ${c.name}\n      ${(e as Error).message}`);
      }
    }
    console.log(`\n结果：${passed} 通过 / ${failed} 失败 / 共 ${passed + failed} 例`);
    if (failed > 0) process.exit(1);
  })();
}
