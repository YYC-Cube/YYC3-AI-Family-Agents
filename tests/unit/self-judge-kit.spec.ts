// @ts-nocheck
/**
 * 自判断套件单元测试（self-judge-kit）—— 真实断言版（v2.7.2，验收 L4）。
 * 覆盖：§5.2 低置信升级 / §6.4 Phase B 校准误差门禁 / §6.1 记忆检索 SLO 指标。
 * 说明：第三例验证**已实现的 SLO 观测链路**（检索超 300ms 落入告警桶）；
 *       「超时降级 fallback」本身尚未实现，不在本用例中伪装通过。
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
    toContain: (exp) => {
      if (!actual.includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${JSON.stringify(actual)}`);
    },
  });
}

import { SelfJudge } from '@shared/self-judge-kit';
import { ConsistencyTracker } from '../../architecture-kernel/02-云枢核心引擎/cloud-pivot-orchestrator/verification-gateway/consistency-metrics.js';
import { FamilyMetrics } from '../../architecture-kernel/09-可观测性/family-metrics.js';

describe('self-judge-kit（自判断套件）', () => {
  it('置信度低于 tau_low=0.6 时应触发升级（§5.2）', () => {
    const judge = new SelfJudge({ config: { tauLow: 0.6, tauHigh: 0.85 } });
    const signal = judge.judge({
      agent: 'tester',
      taskType: 'general',
      candidates: [{ label: '候选A', score: 0.55 }],
      // 三个不确定性来源带来 0.24 惩罚：0.685 - 0.24 = 0.445 < 0.6
      uncertaintySources: ['用户输入歧义性', '上下文不足', '数据缺失'],
    });

    expect(signal.confidence < 0.6).toBe(true);
    expect(signal.escalation !== 'none').toBe(true); // 不允许「自评可自行负责」
  });

  it('自评-外验校准误差 ≤ 0.15 才可放行（§6.4 Phase B）', () => {
    const good = new ConsistencyTracker();
    good.record({ selfEscalation: 'none', selfConfidence: 0.9, calibratedConfidence: 0.9, verified: true });
    good.record({ selfEscalation: 'none', selfConfidence: 0.8, calibratedConfidence: 0.1, verified: false });
    const goodSnap = good.snapshot();
    expect(goodSnap.calibrationError <= 0.15).toBe(true);
    expect(goodSnap.consistencyRate).toBe(0.5); // 1/2 自评未升级样本被证实

    const drift = new ConsistencyTracker();
    drift.record({ selfEscalation: 'none', selfConfidence: 0.9, calibratedConfidence: 0.9, verified: false });
    drift.record({ selfEscalation: 'none', selfConfidence: 0.9, calibratedConfidence: 0.9, verified: true });
    expect(drift.snapshot().calibrationError > 0.15).toBe(true); // 高置信错判 → 校准漂移
  });

  it('记忆检索超 300ms 落入 SLO 告警区间（§6.1 P95>300ms）', () => {
    const metrics = new FamilyMetrics();
    metrics.observeMemoryRetrieval(400); // 400ms

    const text = metrics.render();
    expect(text).toContain('family_memory_retrieval_duration_seconds_bucket{le="0.3"} 0'); // 未落 300ms 内
    expect(text).toContain('family_memory_retrieval_duration_seconds_bucket{le="0.5"} 1'); // 落入超阈桶
    expect(text).toContain('family_memory_retrieval_duration_seconds_count 1');
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
  console.log(`\n结果：${passed} 通过 / ${failures.length} 失败 / ${queue.length - passed - failures.length} 跳过 / 共 ${queue.length} 例`);
  if (failures.length > 0) process.exit(1);
})();
