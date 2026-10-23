// @ts-nocheck
/**
 * 协同度生产端接线测试（collaboration-wiring）—— P1-T4b（v2.15.0）。
 *
 * 验收：
 *   C1 千行澄清接线：真实 IntentGatewayService 包装后，低置信请求记 hit、高置信记 miss
 *   C2 千行澄清零侵入：包装前后结果同构（intent / confidence / routeTo / judgment 一致）
 *   C3 escalation 接线：真实 EscalationPolicy，human-confirm 记 hit、cross-validate 记 miss
 *   C4 escalation 零侵入：决策依据（reason / triggeredBy）原样透出
 *   C5 审计链接线：真实 ComplianceAudit，traceId 非空记 hit；链式哈希 verify() 仍为真
 *   C6 学习回流端到端：装配层受理=分母、回流标注=分子，复盘覆盖率收敛为 1
 *   C7 recordReplay 记账口径：两端增量共用同一 Gauge；零样本不产生 sample 行
 *   C8 四类指标互不串扰：单一 FamilyMetrics 四 kind 独立累计
 *
 * 运行：tsc 编译 + node（零依赖 harness，范式同 metrics-observability）。
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
    toBeTruthy: () => {
      if (!actual) throw new Error(`期望真值，实际 ${JSON.stringify(actual)}`);
    },
    toBeCloseTo: (exp, digits = 6) => {
      if (Math.abs(actual - exp) >= Math.pow(10, -digits) / 2) {
        throw new Error(`期望 ≈ ${exp}（精度 ${digits}），实际 ${actual}`);
      }
    },
    toContain: (exp) => {
      if (!actual.includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${String(actual).slice(0, 200)}`);
    },
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`期望长度 ${n}，实际 ${actual.length}`);
    },
    toMatch: (re) => {
      if (!re.test(actual)) throw new Error(`期望匹配 ${re}，实际 ${String(actual).slice(0, 200)}`);
    },
  });
}

import { IntentGatewayService } from '../../family-agents/business-layer/member-qianhang/core/intent-gateway.service.js';
import { EscalationPolicy } from '../../family-agents/shared-core/self-judge-kit/escalation-policy.js';
import { ComplianceAudit } from '../../architecture-kernel/06-治理中心/compliance-audit/compliance-audit.js';
import { InMemorySkillStore } from '../../architecture-kernel/05-持续学习引擎/learning-loop.js';
import { createRuntimeAssembly } from '../../architecture-kernel/08-系统装配/runtime-assembly.js';
import { FamilyMetrics } from '../../architecture-kernel/09-可观测性/family-metrics.js';
import {
  instrumentIntentGateway,
  instrumentEscalationPolicy,
  instrumentComplianceAudit,
  instrumentOutcomeLabeler,
} from '../../architecture-kernel/09-可观测性/collaboration-instrumentation.js';

let seq = 0;

/** 发布任务事件（受理路径：完整 payload）。 */
function publishTask(bus, traceId, overrides = {}) {
  seq += 1;
  return bus.publish({
    key: { traceId, agentId: 'grandmaster', seq },
    topic: 'task.executed',
    mode: 'broadcast',
    payload: {
      agent: '格物·宗师',
      taskType: '代码审查',
      steps: [{ order: 1, action: '静态分析', ok: true }],
      startedAt: 1000,
      finishedAt: 2000,
      completed: true,
      ...overrides,
    },
    at: 2000,
  });
}

describe('协同度生产端接线（P1-T4b）', () => {
  it('C1 千行澄清接线：低置信请求记 hit，高置信记 miss', async () => {
    const metrics = new FamilyMetrics();
    // 真实千行网关（规则分类器置信下限 0.6，上限 1.0）
    // 命中臂：τ_low=0.85，"你好" 校准置信 ≈0.76 < 0.85 → 触发澄清
    const hitGateway = instrumentIntentGateway(new IntentGatewayService(), metrics, { tauLow: 0.85 });
    await hitGateway.handle({ text: '你好', sessionId: 's1', traceId: 't-clarify-1' });
    // 未命中臂：τ_low=0.59，多关键词命中校准置信 = 1.0（惩罚上限 0.4 仍 ≥ 0.6）→ 不澄清
    const missGateway = instrumentIntentGateway(new IntentGatewayService(), metrics, { tauLow: 0.59 });
    await missGateway.handle({ text: '分析统计对比数据报告', sessionId: 's1', traceId: 't-clarify-2' });

    const snap = metrics.collaborationSnapshot().clarification;
    expect(snap.total).toBe(2);
    expect(snap.hit).toBe(1);
    expect(snap.rate).toBeCloseTo(0.5);
  });

  it('C2 千行澄清零侵入：包装前后结果同构', async () => {
    const metrics = new FamilyMetrics();
    const plain = new IntentGatewayService();
    const wrapped = instrumentIntentGateway(new IntentGatewayService(), metrics);
    const a = await plain.handle({ text: '帮我推荐一本好书', sessionId: 's2', traceId: 't-plain' });
    const b = await wrapped.handle({ text: '帮我推荐一本好书', sessionId: 's2', traceId: 't-wrapped' });
    expect(b.intent).toBe(a.intent);
    expect(b.confidence).toBe(a.confidence);
    expect(b.routeTo).toBe(a.routeTo);
    expect(b.judgment.escalation).toBe(a.judgment.escalation);
    expect(b.latencyMs >= 0).toBeTruthy();
    // 每请求记账：total=1；命中与否由置信决定，此处只验证记账不丢请求
    expect(metrics.collaborationSnapshot().clarification.total).toBe(1);
  });

  it('C3 escalation 接线：human-confirm 记 hit，cross-validate 记 miss', () => {
    const metrics = new FamilyMetrics();
    const policy = instrumentEscalationPolicy(new EscalationPolicy(), metrics);
    // 低置信 → cross-validate（语枢独立分析，非人工终审）
    const cv = policy.decide({ confidence: 0.3 });
    expect(cv.escalation).toBe('cross-validate');
    // 高严重度偏离 → human-confirm（人工终审）
    const hc = policy.decide({ confidence: 0.9, deviation: { severity: 'high', expected: 'A→B→C', actual: 'A→X' } });
    expect(hc.escalation).toBe('human-confirm');

    const snap = metrics.collaborationSnapshot()['human-confirm'];
    expect(snap.total).toBe(2);
    expect(snap.hit).toBe(1);
    expect(snap.rate).toBeCloseTo(0.5);
  });

  it('C4 escalation 零侵入：决策依据原样透出', () => {
    const metrics = new FamilyMetrics();
    const policy = instrumentEscalationPolicy(new EscalationPolicy(), metrics);
    const none = policy.decide({ confidence: 0.9 });
    expect(none.escalation).toBe('none');
    expect(none.triggeredBy).toHaveLength(0);
    const hc = policy.decide({ confidence: 0.1, deviation: { severity: 'high', expected: 'A', actual: 'B' } });
    expect(hc.triggeredBy).toHaveLength(2); // low-confidence + high-deviation
    expect(hc.reason.includes('人工确认')).toBeTruthy();
  });

  it('C5 审计链接线：traceId 非空记 hit；链式哈希 verify() 仍为真', () => {
    const metrics = new FamilyMetrics();
    const audit = instrumentComplianceAudit(new ComplianceAudit(), metrics);
    const req = (traceId) => ({ traceId, actor: 'thinker', action: 'read', resource: 'report.md' });
    audit.append(req('trace-ok-1'), { allowed: true, reason: 'ok' });
    audit.append(req(''), { allowed: false, reason: '缺 traceId' }); // 不可追溯 → miss
    audit.append(req('trace-ok-2'), { allowed: true, reason: 'ok' });

    expect(audit.list()).toHaveLength(3);
    expect(audit.verify()).toBeTruthy(); // Proxy 透传，防篡改语义零改动

    const snap = metrics.collaborationSnapshot().trace;
    expect(snap.total).toBe(3);
    expect(snap.hit).toBe(2);
    expect(snap.rate).toBeCloseTo(2 / 3);
    expect(metrics.render()).toContain('family_collaboration_trace_coverage 0.6666666666666666');
  });

  it('C6 学习回流端到端：受理=分母，标注=分子，覆盖率收敛为 1', () => {
    const metrics = new FamilyMetrics();
    const assembly = createRuntimeAssembly({ metrics, store: new InMemorySkillStore() });

    // 两个决策周期入库（桥接受理 → 复盘分母）
    publishTask(assembly.bus, 't-replay-1');
    publishTask(assembly.bus, 't-replay-2');
    let snap = metrics.collaborationSnapshot().replay;
    expect(snap.total).toBe(2);
    expect(snap.hit).toBe(0);
    expect(snap.rate).toBe(0);

    // 学习周期回流标注（runCycle → labeler.label → 分子）
    const report = assembly.loop.runCycle();
    expect(report.labeled).toHaveLength(2);
    snap = metrics.collaborationSnapshot().replay;
    expect(snap.total).toBe(2);
    expect(snap.hit).toBe(2);
    expect(snap.rate).toBe(1);
    expect(metrics.render()).toContain('family_collaboration_replay_coverage 1');
  });

  it('C7 recordReplay 记账口径：两端增量共用同一 Gauge；零样本无 sample 行', () => {
    const metrics = new FamilyMetrics();
    // 零样本：仅 HELP/TYPE 行，不产生 sample 数字（不污染默认口径）
    expect(metrics.render().includes('family_collaboration_replay_coverage 0')).toBe(false);
    expect(Object.keys(metrics.collaborationSnapshot()).length).toBe(4);

    metrics.recordReplay(3, 2);
    const snap = metrics.collaborationSnapshot().replay;
    expect(snap.total).toBe(3);
    expect(snap.hit).toBe(2);
    expect(snap.rate).toBeCloseTo(2 / 3);
    expect(metrics.render()).toContain('family_collaboration_replay_coverage 0.6666666666666666');

    // 与 recordCollaboration 共用同一张累计表：再回流 1 条 → 4 采 3 标
    metrics.recordCollaboration('replay', true);
    expect(metrics.collaborationSnapshot().replay.total).toBe(4);
    expect(metrics.collaborationSnapshot().replay.hit).toBe(3);
  });

  it('C8 四类指标互不串扰：单一 FamilyMetrics 四 kind 独立累计', async () => {
    const metrics = new FamilyMetrics();
    const gateway = instrumentIntentGateway(new IntentGatewayService(), metrics, { tauLow: 0.59 });
    const policy = instrumentEscalationPolicy(new EscalationPolicy(), metrics);
    const audit = instrumentComplianceAudit(new ComplianceAudit(), metrics);
    const labeler = instrumentOutcomeLabeler(
      { label: () => ({ label: 'success', rationale: 'test' }) },
      metrics,
    );

    await gateway.handle({ text: '分析统计对比数据报告', sessionId: 's8', traceId: 't8' });
    policy.decide({ confidence: 0.9, deviation: { severity: 'high', expected: 'A', actual: 'B' } });
    audit.append({ traceId: 't8', actor: 'a', action: 'x', resource: 'r' }, { allowed: true });
    metrics.recordReplay(1, 0); // 模拟装配层桥接受理（分母）
    labeler.label({});

    const snap = metrics.collaborationSnapshot();
    expect(snap.clarification.total).toBe(1);
    expect(snap['human-confirm'].total).toBe(1);
    expect(snap.trace.total).toBe(1);
    expect(snap.replay.total).toBe(1); // 分母（受理）+ 分子（标注）各一
    expect(snap.replay.rate).toBe(1);
    expect(snap['human-confirm'].rate).toBe(1);
    expect(snap.clarification.rate).toBe(0);
  });
});

(async () => {
  const queue = globalThis.__queue ?? [];
  let passed = 0;
  const failures = [];
  for (const t of queue) {
    try {
      await t.fn();
      passed += 1;
      console.log(`PASS ${t.name}`);
    } catch (e) {
      failures.push(t.name);
      console.log(`FAIL ${t.name}\n      ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\n结果：${passed} 通过 / ${failures.length} 失败 / 共 ${queue.length} 例`);
  if (failures.length > 0) process.exit(1);
})();
