// @ts-nocheck
/**
 * Phase E 知识更新与参数级护栏测试 —— semantic-diff / preference-tracker / rule-evolution / param-adaptation（§5.3）。
 *
 * 覆盖目标（对应《架构设计.md》§6.4 Phase E 验收）：
 *   K1 语义差异：矛盾 / 取代 / 一致跳过 / 新键跳过 / 幂等（确定性）
 *   K2 偏好追踪：渐进提升 + 冲突防抖（衰减再累积）+ 历史可回溯
 *   K3 规则演化：门禁（置信≥0.8 且溯源≥2）+ 确定性 ruleId + 版本升级 + 程序记忆写入请求
 *   K4 参数级护栏：只准入评估、永不执行权重更新（allowed 恒 false）
 *   K5 学→知闭环：学习周期产出模式 → 规则演化建议 → 程序记忆写入受理
 *
 * 运行：tsc 编译 + node（零依赖 harness），后续迁 vitest。
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
    toBeUndefined: () => {
      if (actual !== undefined) throw new Error(`期望 undefined，实际 ${JSON.stringify(actual)}`);
    },
    toContain: (exp) => {
      if (!actual.includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${JSON.stringify(actual)}`);
    },
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`期望长度 ${n}，实际 ${actual.length}`);
    },
  });
}

import { PreferenceTracker } from '../../02-智能协同架构内核/05-持续学习引擎/knowledge-update/preference-tracker.js';
import { RuleEvolution } from '../../02-智能协同架构内核/05-持续学习引擎/knowledge-update/rule-evolution.js';
import { SemanticDiffDetector } from '../../02-智能协同架构内核/05-持续学习引擎/knowledge-update/semantic-diff.js';
import { InMemorySkillStore, LearningLoop } from '../../02-智能协同架构内核/05-持续学习引擎/learning-loop.js';
import {
  PARAM_ADAPTATION_CONTRACT,
  ParamAdaptationGate,
} from '../../02-智能协同架构内核/05-持续学习引擎/param-adaptation.js';
import { MemoryOrchestratorImpl } from '../../03-家人Agent实现集/shared-core/memory-framework/memory-orchestrator/index.js';

/** 达门禁的模式样例。 */
const strongPattern = {
  condition: 'grandmaster · quality-review',
  strategy: 'sast→lint',
  outcome: '任务成功率 100%（3/3 溯源轨迹）',
  supportingTraces: ['t1', 't2', 't3'],
  confidence: 0.95,
};

describe('Phase E 知识更新 · 语义差异 / 偏好 / 规则演化 / 参数护栏 / 学知闭环', () => {
  it('K1 语义差异：矛盾 / 取代 / 一致跳过 / 新键跳过 / 输出幂等', () => {
    const d = new SemanticDiffDetector();

    // 同键异值（无包含关系）→ contradiction，高危可修复
    const r1 = d.diff(['用户|称呼|小云'], ['用户|称呼|小助手']);
    expect(r1).toHaveLength(1);
    expect(r1[0].kind).toBe('contradiction');
    expect(r1[0].issue.severity).toBe('high');
    expect(r1[0].issue.repairable).toBe(true);
    expect(r1[0].issue.layer).toBe('semantic');

    // incoming 包含既有值（细化表述）→ superseded，中危
    const r2 = d.diff(['用户|偏好|简洁'], ['用户|偏好|简洁 且 带示例']);
    expect(r2).toHaveLength(1);
    expect(r2[0].kind).toBe('superseded');
    expect(r2[0].issue.severity).toBe('med');

    // 归一化后同键同值 → 无差异
    expect(d.diff(['User|name|XiaoYun'], ['user | name | xiaoyun'])).toHaveLength(0);

    // 全新键 → 无差异（不属于冲突检测范围）
    expect(d.diff([], ['x|y|z'])).toHaveLength(0);

    // 幂等：同输入两次调用输出一致（确定性、可回归）
    const a = d.diff(['用户|称呼|小云'], ['用户|称呼|小助手']);
    const b = d.diff(['用户|称呼|小云'], ['用户|称呼|小助手']);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('K2 偏好追踪：渐进提升 + 冲突防抖（衰减再累积）+ 历史可回溯', () => {
    const t = new PreferenceTracker();

    // 首见：confidence = alpha
    const p1 = t.update(undefined, '简洁');
    expect(p1.confidence).toBeCloseTo(0.3);

    // 同值反馈渐进提升：0.3 + 0.3×0.7 = 0.51
    const p2 = t.update(p1, '简洁');
    expect(p2.confidence).toBeCloseTo(0.51);

    // 冲突防抖：衰减（0.51×0.5=0.255）再累积 → 0.4785 < 0.51（不粗暴翻转）
    const p3 = t.update(p2, '详细');
    expect(p3.confidence).toBeCloseTo(0.4785);
    expect(p3.confidence < p2.confidence).toBe(true);

    // 同值持续反馈回升：0.4785 + 0.3×0.5215 = 0.63495
    const p4 = t.update(p3, '详细');
    expect(p4.confidence).toBeCloseTo(0.63495);

    // 历史可回溯（旧→新）
    const hist = t.historyOf('unknown');
    expect(hist).toHaveLength(3);
    expect(hist[0].value).toBe('简洁');
    expect(hist[2].value).toBe('详细');
  });

  it('K3 规则演化：门禁拦截低质模式；达门禁产出确定性建议与程序记忆写入请求', () => {
    const e = new RuleEvolution();

    // 门禁：置信不足 / 溯源不足 → 不产建议（防规则自激）
    expect(e.propose({ ...strongPattern, confidence: 0.6 })).toBeUndefined();
    expect(e.propose({ ...strongPattern, supportingTraces: ['t1'] })).toBeUndefined();

    // 达门禁 → 建议（确定性 ruleId）
    const p = e.propose(strongPattern);
    expect(p).toBeTruthy();
    expect(p.ruleId).toContain('rule-');
    expect(p.fromVersion).toBe('1.0.0');
    expect(p.toVersion).toBe('1.1.0');
    expect(p.change).toBe('sast→lint');
    expect(p.rationale).toContain('3 条');

    // 同情境重复 propose → ruleId 稳定（跨周期可升级）
    expect(e.propose(strongPattern).ruleId).toBe(p.ruleId);

    // 既有规则升级：2.3.0 → 2.4.0（minor 演进，与 skill-versioner 对齐）
    const upgraded = e.propose(strongPattern, { ruleId: 'rule-x', fromVersion: '2.3.0' });
    expect(upgraded.ruleId).toBe('rule-x');
    expect(upgraded.toVersion).toBe('2.4.0');

    // 程序记忆写入请求（治理审核通过后提交）
    const w = e.toWriteRequest(p);
    expect(w.layer).toBe('procedural');
    expect(w.provenance.traceId).toBe(p.ruleId);
  });

  it('K4 参数级护栏：资料完备也永不放行（allowed 恒 false）', () => {
    const gate = new ParamAdaptationGate();

    // 资料完备提案：审查项全过，但护栏位恒拒绝
    const v = gate.evaluate({
      id: 'pa-1',
      baseModel: 'qianxing-v1',
      datasetRef: 'ds://family-traces',
      objective: '提升质量判定准确率',
      budgetTokens: 1000,
      requestedBy: 'tutor',
      requestedAt: 1,
    });
    expect(v.allowed).toBe(false);
    for (const item of v.checkedItems) expect(item.met).toBe(true);
    expect(v.reason).toContain('永不执行');

    // 超预算提案：预算审查项不达标，仍恒拒绝（护栏与审查是两道独立的闸）
    const v2 = gate.evaluate({
      id: 'pa-2',
      baseModel: 'm',
      datasetRef: 'd',
      objective: 'o',
      budgetTokens: PARAM_ADAPTATION_CONTRACT.maxBudgetTokens * 10,
      requestedBy: 't',
      requestedAt: 1,
    });
    expect(v2.allowed).toBe(false);
    const budgetItem = v2.checkedItems.find((i) => i.item === 'budget-capped');
    expect(budgetItem.met).toBe(false);

    // 放行前提已声明（回归门禁在首位）
    expect(PARAM_ADAPTATION_CONTRACT.unblockPreconditions[0]).toContain('回归门禁');
    expect(PARAM_ADAPTATION_CONTRACT.unblockPreconditions.length >= 5).toBe(true);
  });

  it('K5 学→知闭环：学习周期模式 → 规则演化建议 → 程序记忆写入受理', async () => {
    const loop = new LearningLoop(new InMemorySkillStore());
    // 3 条宗师通过轨迹：置信 = min(0.5+0.15×2, 0.95) × 1.0 = 0.8，恰达规则演化门禁
    for (let i = 0; i < 3; i += 1) {
      loop.ingest([
        {
          event: {
            traceId: `tr-k5-${i}`,
            agent: 'grandmaster',
            taskType: 'quality-review',
            steps: [
              { order: 1, action: 'scan', tool: 'sast', ok: true },
              { order: 2, action: 'lint', tool: 'lint', ok: true },
            ],
            startedAt: 0,
            finishedAt: 1,
            completed: true,
          },
          goldenPass: true,
        },
      ]);
    }
    const report = loop.runCycle();
    expect(report.promoted).toHaveLength(1);

    // 模式 → 规则演化建议（学习置信 0.8 ≥ 0.8 门禁，溯源 3 条 ≥ 2）
    const proposal = new RuleEvolution().propose(report.promoted[0].sourcePattern);
    expect(proposal).toBeTruthy();
    expect(proposal.change).toBe('sast→lint');

    // 建议经"治理审核"（测试中直接放行）→ 程序记忆写入受理
    const orch = new MemoryOrchestratorImpl();
    const writeReq = new RuleEvolution().toWriteRequest(proposal);
    const ack = await orch.commit({
      ...writeReq,
      provenance: { ...writeReq.provenance, ts: Date.now() },
    });
    expect(ack.accepted).toBe(true);
    expect(ack.layer).toBe('procedural');
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
        console.log(`FAIL  ${c.name}\n      ${e && e.message}`);
      }
    }
    console.log(`\n结果：${passed} 通过 / ${failed} 失败 / 共 ${passed + failed} 例`);
    if (failed > 0) process.exit(1);
  })();
}
