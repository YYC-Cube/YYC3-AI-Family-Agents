// @ts-nocheck
/**
 * 装配层端到端冒烟（assembly-e2e）—— infra-1～4 接线闭环实测（v2.6.0，§6.4）。
 *
 * 验收（装配指导 A1–A5）：
 *   A1 总线发布合法 task.executed → 桥接受理 → collector 采集（事件唯一入口）；
 *   A2 轨迹 + signal 标签 → runCycle 固化 → FileSkillStore 落盘（active v1.0.0）；
 *   A3 必败评估器 → 回归门禁 → healingRollback 钩子 → RollbackController
 *      （healed + contractMet + RTO≤600s）+ 落盘状态翻转（无前置版本 → activeSkills 0）；
 *   A4 坏载荷拒收计数，主流程不抛错；
 *   A5 同幂等键重复发布 → 总线去重，collector 数量不变。
 *
 * 核心红线：bridge（事件入口）与 loop.signal（标签入口）分离，绝无双采。
 * 运行：tsc 编译 + node（零依赖 harness，范式同 pillars-smoke）。
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
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`期望长度 ${n}，实际 ${actual.length}`);
    },
    toBeUndefined: () => {
      if (actual !== undefined) throw new Error(`期望 undefined，实际 ${JSON.stringify(actual)}`);
    },
  });
}

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRuntimeAssembly } from '../../architecture-kernel/08-系统装配/runtime-assembly.js';
import { FamilyMetrics } from '../../architecture-kernel/09-可观测性/family-metrics.js';

/** 独立临时落盘目录（每例隔离，finally 清理）。 */
function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-assembly-'));
}

let seq = 0;

/** 发布一条 task.executed 总线事件（payload 可覆写用于坏载荷用例）。 */
function publishTask(bus, traceId, overrides = {}) {
  seq += 1;
  return bus.publish({
    key: { traceId, agentId: 'grandmaster', seq },
    topic: 'task.executed',
    mode: 'broadcast',
    payload: {
      agent: '格物·宗师',
      taskType: '代码审查',
      steps: [
        { order: 1, action: '静态分析', tool: 'tsc', ok: true },
        { order: 2, action: '规则修复', ok: true },
      ],
      startedAt: 1000,
      finishedAt: 2000,
      completed: true,
      ...overrides,
    },
    at: 2000,
  });
}

describe('装配层端到端冒烟（infra-1～4 闭环）', () => {
  it('A1: 总线发布合法事件 → 桥接受理并采集（事件唯一入口）', async () => {
    const dir = makeTmpDir();
    try {
      const asm = createRuntimeAssembly({ skillStoreDir: dir });
      await publishTask(asm.bus, 'trace-a1');
      expect(asm.bridge.stats.accepted).toBe(1);
      expect(asm.loop.components.collector.size()).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('A2: 轨迹 + signal 标签 → 固化 → FileSkillStore 落盘 active v1.0.0', async () => {
    const dir = makeTmpDir();
    try {
      const asm = createRuntimeAssembly({ skillStoreDir: dir });
      for (const traceId of ['trace-a2-1', 'trace-a2-2', 'trace-a2-3']) {
        await publishTask(asm.bus, traceId);
        asm.loop.signal(traceId, true); // 外验裁定证实（标签入口与事件入口分离）
      }
      const report = asm.loop.runCycle({ minSamples: 2 });
      expect(report.promoted.length).toBe(1);

      const skill = report.promoted[0];
      expect(skill.version).toBe('1.0.0');
      // 落盘断言：一技能一文件，且 activeSkills 可从磁盘恢复
      const files = fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
      expect(files.length).toBe(1);
      expect(files[0]).toBe(`${skill.id}.json`);
      expect(asm.store.activeSkills().length).toBe(1);
      // traceId 溯源贯穿（总线 → 轨迹 → 技能 supportingTraces）
      expect(skill.sourcePattern.supportingTraces.length).toBe(3);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('A3: 必败评估 → 门禁回滚 → 钩子委托 RollbackController 记账 + 落盘翻转', async () => {
    const dir = makeTmpDir();
    try {
      const hookEvents = [];
      const outcomes = [];
      const asm = createRuntimeAssembly({
        skillStoreDir: dir,
        learning: {
          regressionCases: [{ id: 'c1', expected: 'ok' }],
          evaluate: () => 'broken', // 注入必败评估器
        },
        onRollback: (event, outcome) => {
          hookEvents.push(event);
          outcomes.push(outcome);
        },
      });
      for (const traceId of ['trace-a3-1', 'trace-a3-2', 'trace-a3-3']) {
        await publishTask(asm.bus, traceId);
        asm.loop.signal(traceId, true);
      }
      const report = asm.loop.runCycle({ minSamples: 2 });

      // 学习侧：门禁打回 + 无前置版本（如实上报，不谎报愈合）
      expect(report.promoted.length).toBe(0);
      expect(report.rolledBack.length).toBe(1);
      expect(report.rolledBack[0].restored).toBe(undefined);
      // 钩子触发一次，事件结构完整
      expect(hookEvents.length).toBe(1);
      expect(hookEvents[0].restored).toBe(undefined);
      // 07 侧记账：healed + 契约达标 + RTO 预算内（同步执行，秒级 ≪ 600s）
      expect(outcomes.length).toBe(1);
      expect(outcomes[0].status).toBe('healed');
      expect(outcomes[0].contractMet).toBe(true);
      expect(outcomes[0].rtoSeconds <= 600).toBe(true);
      // 落盘翻转：回滚状态已持久化，activeSkills 为 0（稳定性红线）
      expect(asm.store.activeSkills().length).toBe(0);
      const raw = JSON.parse(fs.readFileSync(path.join(dir, `${report.rolledBack[0].skillId}.json`), 'utf-8'));
      expect(raw[0].status).toBe('rolled-back');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('A4: 坏载荷拒收计数，主流程不抛错', async () => {
    const dir = makeTmpDir();
    try {
      const asm = createRuntimeAssembly({ skillStoreDir: dir });
      await publishTask(asm.bus, 'trace-a4', { completed: undefined, agent: undefined });
      expect(asm.bridge.stats.rejected).toBe(1);
      expect(asm.loop.components.collector.size()).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('A5: 同幂等键重复发布 → 总线去重，collector 数量不变', async () => {
    const dir = makeTmpDir();
    try {
      const asm = createRuntimeAssembly({ skillStoreDir: dir });
      const duplicate = () =>
        asm.bus.publish({
          key: { traceId: 'trace-a5', agentId: 'grandmaster', seq: 42 },
          topic: 'task.executed',
          mode: 'broadcast',
          payload: {
            agent: '格物·宗师',
            taskType: '代码审查',
            steps: [{ order: 1, action: '静态分析', ok: true }],
            startedAt: 1000,
            finishedAt: 2000,
            completed: true,
          },
          at: 2000,
        });
      await duplicate();
      await duplicate();
      await duplicate();
      expect(asm.bridge.stats.accepted).toBe(1);
      expect(asm.loop.components.collector.size()).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('A6: 信号 → 去抖侦测 → 降级 → 熔断状态入指标（默认愈链路）', async () => {
    const dir = makeTmpDir();
    try {
      const metrics = new FamilyMetrics();
      const asm = createRuntimeAssembly({
        skillStoreDir: dir,
        metrics,
        faultDetector: { debounceCount: 1 }, // 立即上报，便于断言
        degradation: { failureThreshold: 3 },
      });

      // 超阈信号 → 故障 → 降级动作（bus 层 closed 态走 throttle）
      const outcome = asm.handleSignal({ layer: 'bus', type: 'message-backlog', observed: 120, threshold: 100 });
      expect(outcome.status).toBe('degraded');
      expect(metrics.healingActions.value({ layer: 'bus', status: 'degraded' })).toBe(1);
      expect(metrics.circuitState.value({ state: 'closed' })).toBe(1);

      // 信号回落 → 不产出故障
      expect(asm.handleSignal({ layer: 'bus', type: 'message-backlog', observed: 90, threshold: 100 })).toBeUndefined();

      // 连续失败达阈值 → 跳闸 open，指标同步翻转
      asm.degradation.recordFailure();
      asm.degradation.recordFailure();
      asm.degradation.recordFailure();
      expect(asm.degradation.circuitState).toBe('open');
      expect(metrics.circuitState.value({ state: 'open' })).toBe(1);
      expect(metrics.circuitState.value({ state: 'closed' })).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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
