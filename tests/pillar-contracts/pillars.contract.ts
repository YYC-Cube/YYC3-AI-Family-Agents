// @ts-nocheck
/**
 * 五支柱契约测试（pillars.contract）—— 真实校验版（v2.7.2，验收 L4）。
 *
 * 门禁映射：架构 §6.4「验证门禁」——每支柱一条可执行契约，全部跑真实实现。
 * 设计：check() 为纯同步断言；任一支柱行为退化 → 契约失败 → 门禁拦截。
 */

import { SelfJudge } from '@shared/self-judge-kit';
import { EpisodicStore } from '@shared/memory-framework/episodic-store';
import { RegressionTester } from '../../architecture-kernel/05-持续学习引擎/stability-guard/regression-tester.js';
import { ComplianceAudit } from '../../architecture-kernel/06-治理中心/compliance-audit/compliance-audit.js';
import { RollbackController } from '../../architecture-kernel/07-自愈中心/rollback-controller/rollback-controller.js';

/** 契约定义：单支柱可校验的最小单元 */
export interface PillarContract {
  readonly id: string;
  readonly name: string;
  readonly gate: string;
  /** 真实断言：返回 true 视为通过 */
  readonly check: () => boolean;
}

/** 自 · 自判断闭环：低置信必须升级（§5.2 / §6.4 Phase B） */
const selfContract: PillarContract = {
  id: 'self',
  name: '自 · 自判断',
  gate: '§6.4 Phase B：自评-外验一致率 ≥ 90%，校准误差 ≤ 0.15',
  check: () => {
    const signal = new SelfJudge({ config: { tauLow: 0.6, tauHigh: 0.85 } }).judge({
      agent: 'contract',
      taskType: 'general',
      candidates: [{ label: '候选A', score: 0.55 }],
      uncertaintySources: ['用户输入歧义性', '上下文不足', '数据缺失'],
    });
    return signal.confidence < 0.6 && signal.escalation !== 'none';
  },
};

/** 知 · 记忆检索：写入后可被检索命中（trace 贯通） */
const awareContract: PillarContract = {
  id: 'aware',
  name: '知 · 记忆',
  gate: '§6.4：写入 → 检索链路可达，traceId 贯穿',
  check: () => {
    const store = new EpisodicStore();
    store.record({
      traceId: 'contract-trace-1',
      agent: 'contract',
      eventTime: Date.now(),
      type: 'task.completed',
      payload: { text: '本季度报告已完成', salience: 0.8 },
    });
    const hits = store.retrieve({ text: '季度报告' });
    return hits.length === 1 && hits[0].id.includes('contract-trace-1');
  },
};

/** 学 · 持续学习：回归零退化才放行，出现退化必须拦截 */
const learnContract: PillarContract = {
  id: 'learn',
  name: '学 · 持续学习',
  gate: '§6.4：tests/regression/baseline.json 回归用例通过率 100%',
  check: () => {
    const tester = new RegressionTester();
    const cases = [{ id: 'c1', expected: 'ok' }];
    const pass = tester.run('skill-x', '1.0.0', cases, () => 'ok');
    const regression = tester.run('skill-x', '1.0.0', cases, () => 'broken');
    return pass.passed && !regression.passed;
  },
};

/** 治 · 治理合规：审计链可验真，篡改即断链 */
const governContract: PillarContract = {
  id: 'govern',
  name: '治 · 治理合规',
  gate: '§6.4：06-治理中心 compliance-audit 零高危项',
  check: () => {
    const audit = new ComplianceAudit();
    const req = { traceId: 'contract-trace-2', actor: 'contract', action: 'tool.invoke', resource: 'db' };
    const decision = { decision: 'allow', policyId: 'p-1', policyVersion: '1.0.0', reason: '契约校验' };
    audit.append(req, decision);
    audit.append(req, decision);
    const intact = audit.verify();
    audit.list()[0].actor = 'intruder';
    return intact && audit.verify() === false;
  },
};

/** 愈 · 自愈降级：技能回滚闭环且 RTO 契约达成 */
const healContract: PillarContract = {
  id: 'heal',
  name: '愈 · 自愈降级',
  gate: '§6.4：07-自愈中心 演练路径全部可达',
  check: () => {
    const controller = new RollbackController({ skill: { rollbackSkill: () => '1.0.0' } });
    const outcome = controller.rollback(
      {
        id: 'contract-fault-1',
        layer: 'learning',
        type: 'regression-failed',
        severity: 'high',
        detail: '契约校验',
        detectedAt: Date.now(),
      },
      'skill-x',
    );
    return outcome.status === 'healed' && outcome.contractMet === true;
  },
};

/** 五支柱契约清单（顺序：自 → 知 → 学 → 治 → 愈） */
export const pillarContracts: readonly PillarContract[] = [
  selfContract,
  awareContract,
  learnContract,
  governContract,
  healContract,
];

/** 契约执行汇总报告 */
export interface ContractReport {
  readonly total: number;
  readonly passed: number;
  readonly failed: readonly string[];
  readonly allPassed: boolean;
}

/** 执行全部五支柱契约并返回汇总。 */
export function runContracts(): ContractReport {
  const failed: string[] = [];
  for (const contract of pillarContracts) {
    let ok = false;
    try {
      ok = contract.check();
    } catch {
      ok = false; // 契约内部异常视为失败（不静默放行）
    }
    if (!ok) failed.push(contract.id);
  }
  return {
    total: pillarContracts.length,
    passed: pillarContracts.length - failed.length,
    failed,
    allPassed: failed.length === 0,
  };
}

// ---------- 零依赖 harness（作为 spec 运行时输出汇总行） ----------

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
  });
}

describe('五支柱契约（自·知·学·治·愈）', () => {
  for (const contract of pillarContracts) {
    globalThis.it(contract.name, () => {
      globalThis.expect(contract.check()).toBe(true);
    });
  }
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
  const report = runContracts();
  console.log(`\n契约汇总：${report.passed}/${report.total} 通过，失败项 ${report.failed.length ? report.failed.join(',') : '无'}`);
  console.log(`结果：${passed} 通过 / ${failures.length} 失败 / ${queue.length - passed - failures.length} 跳过 / 共 ${queue.length} 例`);
  if (failures.length > 0 || !report.allPassed) process.exit(1);
})();
