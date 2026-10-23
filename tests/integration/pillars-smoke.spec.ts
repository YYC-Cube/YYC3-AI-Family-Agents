// @ts-nocheck
/**
 * 三支柱贯通冒烟测试 ——「自」→「治」→「学」跨支柱数据流（§3.4 协同关系实测）。
 *
 * 数据流：家人 self-judge 产出信号（自）
 *        → VerificationGateway.adjudicate 外验裁定（治）
 *        → goldenPass = effective.verified 回流 LearningLoop（学）
 *        → 模式 → 版本化技能。
 *
 * 冒烟断言的核心原则：
 *   P1 学习标签来自**外验**而非自评（海市蜃楼轨迹必须变成负样本）；
 *   P2 traceId 三环贯穿（技能 supportingTraces 可溯源到裁定链路）；
 *   P3 反证抑制：被驳斥轨迹拉低簇成功率，阻止坏模式固化；
 *   P4 指标一致：gateway 一致率统计与学习侧标注数对应。
 *
 * 运行：tsc 编译 + node（@shared/@members 别名经 /tmp 钩子解析），后续迁 vitest。
 */

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
    toBeTruthy: () => {
      if (!actual) throw new Error(`期望真值，实际 ${JSON.stringify(actual)}`);
    },
    toContain: (exp) => {
      if (!actual.includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${JSON.stringify(actual)}`);
    },
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`期望长度 ${n}，实际 ${actual.length}`);
    },
  });
}

import { createMemberSelfJudge } from '@members/core-layer/member-grandmaster/self-judge/index.js';
import { CrossValidator } from '../../architecture-kernel/02-云枢核心引擎/cloud-pivot-orchestrator/verification-gateway/cross-validator.js';
import { VerificationGateway } from '../../architecture-kernel/02-云枢核心引擎/cloud-pivot-orchestrator/verification-gateway/gateway.js';
import { GroundTruthChecker } from '../../architecture-kernel/02-云枢核心引擎/cloud-pivot-orchestrator/verification-gateway/ground-truth-checker.js';
import { OracleRegistry } from '../../architecture-kernel/02-云枢核心引擎/cloud-pivot-orchestrator/verification-gateway/oracle-registry.js';
import { InMemorySkillStore, LearningLoop } from '../../architecture-kernel/05-持续学习引擎/learning-loop.js';

let seq = 0;
const grandmaster = createMemberSelfJudge();

/** 构建独立网关（真值源 + 万物复核人），truth 为模拟世界状态。 */
function buildGateway() {
  const truth = new Map<string, boolean>();
  const registry = new OracleRegistry();
  registry.register({ id: 'ci-build-api', kind: 'api', description: 'CI 构建状态' });
  const gt = new GroundTruthChecker(registry);
  gt.registerProbe('ci-build-api', (claim) => {
    const m = /^quality:passed@(.+)$/.exec(claim);
    if (!m) return null;
    return truth.get(m[1]) === true;
  });
  const xv = new CrossValidator();
  xv.registerReviewer('thinker', (_sig, req) => ({
    agrees: !/refute/.test(req.claim),
    confidence: 0.8,
    note: '万物独立分析',
  }));
  return { gw: new VerificationGateway({ groundTruth: gt, crossValidator: xv }), truth };
}

/**
 * 三环单步：宗师自评（自）→ 网关外验（治）→ 回流登记（学）。
 * 返回裁定记录与 buildId（traceId 三环贯穿的关联键）。
 */
async function judgeVerifyIngest(loop, gw, truth, { claimPassed, reallyPassed, tools }) {
  seq += 1;
  const buildId = `b-${seq}`;
  truth.set(buildId, reallyPassed);
  const sig = grandmaster.judge({
    agent: 'grandmaster',
    taskType: 'quality-judgment',
    candidates: [
      { label: 'passed', score: claimPassed ? 0.9 : 0.88 },
      { label: 'failed', score: 0.05 },
    ],
    uncertaintySources: [],
  });
  const rec = await gw.adjudicate(sig, {
    traceId: buildId,
    agent: 'grandmaster',
    claim: `quality:passed@${buildId}`,
  });
  loop.ingest([
    {
      event: {
        traceId: buildId,
        agent: 'grandmaster',
        taskType: 'quality-judgment',
        steps: tools.map((tool, i) => ({ order: i + 1, action: `step-${i + 1}`, tool, ok: true })),
        startedAt: seq * 10,
        finishedAt: seq * 10 + 5,
        completed: true,
        judgment: sig,
      },
      goldenPass: rec.effective.verified, // ★ P1：学习标签取外验结论，而非自评
    },
  ]);
  return { rec, buildId };
}

describe('三支柱贯通冒烟 · 自（self-judge）→ 治（verification-gateway）→ 学（learning-loop）', () => {
  it('S1 正向贯通：外验证实轨迹回流 → 模式 → 技能 v1.0.0，traceId 三环贯穿', async () => {
    const { gw, truth } = buildGateway();
    const store = new InMemorySkillStore();
    const loop = new LearningLoop(store, {
      regressionCases: [{ id: 'r1', expected: 'ok' }],
      evaluate: () => 'ok',
    });
    const ids = [];
    for (let i = 0; i < 3; i += 1) {
      const { rec, buildId } = await judgeVerifyIngest(loop, gw, truth, {
        claimPassed: true,
        reallyPassed: true,
        tools: ['sast', 'lint'],
      });
      expect(rec.effective.verified).toBe(true);
      expect(rec.finalEscalation).toBe('none');
      ids.push(buildId);
    }
    const report = loop.runCycle();
    expect(report.promoted).toHaveLength(1);
    const skill = report.promoted[0];
    expect(skill.version).toBe('1.0.0');
    // P2：技能溯源包含全部裁定 traceId
    for (const id of ids) expect(skill.sourcePattern.supportingTraces).toContain(id);
    // 治→学标签一致：3 条均 success
    expect(report.labeled.filter((l) => l.label === 'success')).toHaveLength(3);
    // 自环指标：3 例自评未升级全部证实
    const snap = gw.metrics.snapshot();
    expect(snap.selfOkSamples).toBe(3);
    expect(snap.consistencyRate).toBe(1);
  });

  it('S2 海市蜃楼贯通：外验驳斥 → human-confirm → 学习标签 failure → 反证抑制成簇', async () => {
    const { gw, truth } = buildGateway();
    const store = new InMemorySkillStore();
    const loop = new LearningLoop(store);
    await judgeVerifyIngest(loop, gw, truth, { claimPassed: true, reallyPassed: true, tools: ['sast', 'lint'] });
    await judgeVerifyIngest(loop, gw, truth, { claimPassed: true, reallyPassed: true, tools: ['sast', 'lint'] });
    const { rec, buildId } = await judgeVerifyIngest(loop, gw, truth, {
      claimPassed: true,
      reallyPassed: false, // 真实世界：构建已破，自评仍高置信通过
      tools: ['sast', 'lint'],
    });
    // 治环：海市蜃楼被捕获并拦截
    expect(rec.mirageSuspected).toBe(true);
    expect(rec.finalEscalation).toBe('human-confirm');
    // 学环：标签来自外验（非自评）→ failure
    const report = loop.runCycle();
    const bad = report.labeled.find((l) => l.trajectory.traceId === buildId);
    expect(bad.label).toBe('failure');
    expect(bad.rationale).toContain('未通过');
    // P3：反证抑制 —— 2 成功 + 1 失败 → 成功率 0.67 < 0.8 → 坏模式不得固化
    expect(report.patterns).toHaveLength(0);
    expect(report.promoted).toHaveLength(0);
    // P4：指标一致 —— 3 例未升级，2 证实，海市蜃楼 1
    const snap = gw.metrics.snapshot();
    expect(snap.selfOkSamples).toBe(3);
    expect(snap.consistencyRate).toBeCloseTo(2 / 3);
    expect(snap.mirageCount).toBe(1);
  });

  it('S3 跨周期演进：新证据回流 → 同技能 minor 升级 v1.1.0，旧版降级', async () => {
    const { gw, truth } = buildGateway();
    const store = new InMemorySkillStore();
    const loop = new LearningLoop(store, {
      regressionCases: [{ id: 'r1', expected: 'ok' }],
      evaluate: () => 'ok',
    });
    for (let i = 0; i < 2; i += 1) {
      await judgeVerifyIngest(loop, gw, truth, { claimPassed: true, reallyPassed: true, tools: ['sast', 'lint'] });
    }
    const first = loop.runCycle();
    expect(first.promoted[0].version).toBe('1.0.0');
    for (let i = 0; i < 2; i += 1) {
      await judgeVerifyIngest(loop, gw, truth, { claimPassed: true, reallyPassed: true, tools: ['sast', 'lint'] });
    }
    const second = loop.runCycle();
    expect(second.promoted).toHaveLength(1);
    expect(second.promoted[0].version).toBe('1.1.0');
    // 同一技能 ID（同簇升级，非新技能）
    expect(second.promoted[0].id).toBe(first.promoted[0].id);
    const hist = store.historyOf(first.promoted[0].id);
    expect(hist).toHaveLength(2);
    expect(hist.find((s) => s.version === '1.0.0').status).toBe('deprecated');
  });

  it('S4 闭环不变量：被驳斥轨迹不得进入任何 active 技能的溯源', async () => {
    const { gw, truth } = buildGateway();
    const store = new InMemorySkillStore();
    const loop = new LearningLoop(store, {
      regressionCases: [{ id: 'r1', expected: 'ok' }],
      evaluate: () => 'ok',
    });
    const goodIds = [];
    let badId = '';
    // 簇 A（sast→lint）：3 证实 + 1 驳斥 → 0.75 被抑制
    for (let i = 0; i < 3; i += 1) {
      const r = await judgeVerifyIngest(loop, gw, truth, { claimPassed: true, reallyPassed: true, tools: ['sast', 'lint'] });
      goodIds.push(r.buildId);
    }
    badId = (await judgeVerifyIngest(loop, gw, truth, { claimPassed: true, reallyPassed: false, tools: ['sast', 'lint'] })).buildId;
    // 簇 B（semgrep）：2 证实 → 应固化
    const bIds = [];
    for (let i = 0; i < 2; i += 1) {
      const r = await judgeVerifyIngest(loop, gw, truth, { claimPassed: true, reallyPassed: true, tools: ['semgrep'] });
      bIds.push(r.buildId);
    }
    const report = loop.runCycle();
    // 簇 A 被驳斥反证抑制；簇 B 固化
    expect(report.promoted).toHaveLength(1);
    expect(report.promoted[0].sourcePattern.strategy).toBe('semgrep');
    for (const id of bIds) expect(report.promoted[0].sourcePattern.supportingTraces).toContain(id);
    // 不变量：坏 traceId 不出现在任何已固化技能溯源中
    for (const skill of store.activeSkills()) {
      const traces = skill.sourcePattern ? skill.sourcePattern.supportingTraces : [];
      expect(traces.includes(badId)).toBe(false);
      for (const id of goodIds) void id;
    }
    expect(store.activeSkills()).toHaveLength(1);
  });
});

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
