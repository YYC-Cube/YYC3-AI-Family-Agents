// @ts-nocheck
/**
 * 可观测性数据面测试（metrics-observability）—— P0 指标采集落地实测（v2.7.0）。
 *
 * 验收：
 *   M1 注册器文本 exposition（# HELP / # TYPE / 标签字典序 / 累积分桶）
 *   M2 桥接埋点（受理/拒收 + 任务结果 + 执行时长直方图）
 *   M3 学习周期埋点（promoted / rolledBack / 回归失败用例数）
 *   M4 自愈埋点（动作 / RTO / RTO 契约达成）
 *   M5 记忆检索埋点（Proxy 装饰器计时，零侵入）
 *   M6 /metrics HTTP 端点（Prometheus 文本协议可抓取）
 *   M7 Bearer 鉴权（L3 闭环）
 *   M8 运行时入口端到端（L1 / L6 闭环）
 *
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
    toBeCloseTo: (exp, digits = 6) => {
      if (Math.abs(actual - exp) >= Math.pow(10, -digits) / 2) {
        throw new Error(`期望 ≈ ${exp}（精度 ${digits}），实际 ${actual}`);
      }
    },
    toContain: (exp) => {
      if (!actual.includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${JSON.stringify(actual)}`);
    },
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`期望长度 ${n}，实际 ${actual.length}`);
    },
  });
}

import { InMemorySkillStore } from '../../02-智能协同架构内核/05-持续学习引擎/learning-loop.js';
import { createRuntimeAssembly } from '../../02-智能协同架构内核/08-系统装配/runtime-assembly.js';
import { startRuntime } from '../../02-智能协同架构内核/08-系统装配/runtime-entry.js';
import { FamilyMetrics, instrumentMemoryOrchestrator } from '../../02-智能协同架构内核/09-可观测性/family-metrics.js';
import { MetricsRegistry } from '../../02-智能协同架构内核/09-可观测性/metrics-registry.js';
import { startMetricsServer } from '../../02-智能协同架构内核/09-可观测性/metrics-server.js';

let seq = 0;

/** 发布任务事件（payload 覆写用于拒收 / 失败场景）。 */
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

describe('可观测性数据面（P0 指标采集）', () => {
  it('M1: 注册器文本 exposition（HELP/TYPE/标签字典序/累积分桶）', () => {
    const reg = new MetricsRegistry();
    const c = reg.counter('family_demo_total', '演示计数');
    c.inc({ b: '2', a: '1' });
    c.inc({ b: '2', a: '1' });
    const g = reg.gauge('family_demo_value', '演示值');
    g.set(3);
    const h = reg.histogram('family_demo_duration_seconds', '演示直方图', [0.1, 0.5]);
    h.observe(0.05);
    h.observe(0.3);

    const text = reg.render();
    expect(text).toContain('# HELP family_demo_total 演示计数');
    expect(text).toContain('# TYPE family_demo_total counter');
    expect(text).toContain('family_demo_total{a="1",b="2"} 2'); // 标签按 key 字典序
    expect(text).toContain('# TYPE family_demo_value gauge');
    expect(text).toContain('family_demo_value 3');
    expect(text).toContain('# TYPE family_demo_duration_seconds histogram');
    expect(text).toContain('family_demo_duration_seconds_bucket{le="0.1"} 1');
    expect(text).toContain('family_demo_duration_seconds_bucket{le="0.5"} 2');
    expect(text).toContain('family_demo_duration_seconds_bucket{le="+Inf"} 2');
    expect(text).toContain('family_demo_duration_seconds_count 2');
    expect(h.sum()).toBeCloseTo(0.35);
  });

  it('M2: 桥接埋点（受理/拒收 + 任务结果 + 执行时长）', async () => {
    const metrics = new FamilyMetrics();
    const asm = createRuntimeAssembly({ store: new InMemorySkillStore(), metrics });

    await publishTask(asm.bus, 'trace-m2-ok', { startedAt: 1000, finishedAt: 3000 });
    await publishTask(asm.bus, 'trace-m2-fail', { completed: false });
    await publishTask(asm.bus, 'trace-m2-bad', { agent: undefined, completed: undefined });

    expect(metrics.bridgeEvents.value({ result: 'accepted' })).toBe(2);
    expect(metrics.bridgeEvents.value({ result: 'rejected' })).toBe(1);
    expect(metrics.taskExecuted.value({ outcome: 'completed' })).toBe(1);
    expect(metrics.taskExecuted.value({ outcome: 'failed' })).toBe(1);
    expect(metrics.taskDuration.count()).toBe(2);
    expect(metrics.taskDuration.sum()).toBeCloseTo(3); // 2s + 1s
  });

  it('M3: 学习周期埋点（promoted / rolledBack / 回归失败用例数）', async () => {
    const metrics = new FamilyMetrics();
    const ok = createRuntimeAssembly({ store: new InMemorySkillStore(), metrics });
    for (const t of ['trace-m3-1', 'trace-m3-2', 'trace-m3-3']) {
      await publishTask(ok.bus, t);
      ok.loop.signal(t, true);
    }
    ok.loop.runCycle({ minSamples: 2 });
    expect(metrics.learningCycles.value()).toBe(1);
    expect(metrics.learningPromoted.value()).toBe(1);
    expect(metrics.learningRolledBack.value()).toBe(0);
    expect(metrics.regressionFailedCases.value()).toBe(0);

    // 必败门禁 → 回滚 + 回归失败用例数（1 个用例失败）
    const bad = createRuntimeAssembly({
      store: new InMemorySkillStore(),
      metrics,
      learning: { regressionCases: [{ id: 'c1', expected: 'ok' }], evaluate: () => 'broken' },
    });
    for (const t of ['trace-m3-b1', 'trace-m3-b2', 'trace-m3-b3']) {
      await publishTask(bad.bus, t);
      bad.loop.signal(t, true);
    }
    bad.loop.runCycle({ minSamples: 2 });
    expect(metrics.learningCycles.value()).toBe(2);
    expect(metrics.learningRolledBack.value()).toBe(1);
    expect(metrics.regressionFailedCases.value()).toBe(1);
  });

  it('M4: 自愈埋点（动作 / RTO / 契约达成）', async () => {
    const metrics = new FamilyMetrics();
    const asm = createRuntimeAssembly({
      store: new InMemorySkillStore(),
      metrics,
      learning: { regressionCases: [{ id: 'c1', expected: 'ok' }], evaluate: () => 'broken' },
    });
    for (const t of ['trace-m4-1', 'trace-m4-2', 'trace-m4-3']) {
      await publishTask(asm.bus, t);
      asm.loop.signal(t, true);
    }
    asm.loop.runCycle({ minSamples: 2 });

    expect(metrics.healingActions.value({ layer: 'learning', status: 'healed' })).toBe(1);
    expect(metrics.healingContractMet.value({ layer: 'learning' })).toBe(1);
    expect(metrics.healingRto.value({ layer: 'learning' }) >= 0).toBe(true);
  });

  it('M5: 记忆检索埋点（Proxy 装饰器零侵入计时）', async () => {
    const metrics = new FamilyMetrics();
    const inner = {
      async retrieve() {
        return { hits: [] };
      },
      async commit() {
        return { accepted: true };
      },
      async forget() {
        return { forgotten: [] };
      },
      async checkConsistency() {
        return { ok: true };
      },
    };
    const wrapped = instrumentMemoryOrchestrator(inner, metrics);
    const bundle = await wrapped.retrieve({ text: '季度报告' }, { taskId: 't1' });
    expect(bundle.hits.length).toBe(0);
    expect(metrics.memoryRetrieval.count()).toBe(1);
    // 其余方法透传（不产生检索指标）
    await wrapped.checkConsistency({});
    expect(metrics.memoryRetrieval.count()).toBe(1);
  });

  it('M6: /metrics HTTP 端点（Prometheus 文本协议可抓取）', async () => {
    const metrics = new FamilyMetrics();
    metrics.taskExecuted.inc({ outcome: 'completed' });
    const server = await startMetricsServer({ metrics, port: 0 });
    try {
      const res = await fetch(`${server.url}/metrics`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('# TYPE family_task_executed_total counter');
      expect(text).toContain('family_task_executed_total{outcome="completed"} 1');

      const health = await fetch(`${server.url}/healthz`);
      expect(health.status).toBe(200);

      const missing = await fetch(`${server.url}/nope`);
      expect(missing.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it('M7: /metrics Bearer 鉴权（缺失/错误 401，正确 200；healthz 免鉴权）', async () => {
    const metrics = new FamilyMetrics();
    metrics.taskExecuted.inc({ outcome: 'completed' });
    const server = await startMetricsServer({ metrics, port: 0, authToken: 'tok-secret' });
    try {
      const none = await fetch(`${server.url}/metrics`);
      expect(none.status).toBe(401);

      const wrong = await fetch(`${server.url}/metrics`, {
        headers: { Authorization: 'Bearer wrong' },
      });
      expect(wrong.status).toBe(401);

      const ok = await fetch(`${server.url}/metrics`, {
        headers: { Authorization: 'Bearer tok-secret' },
      });
      expect(ok.status).toBe(200);
      expect(await ok.text()).toContain('family_task_executed_total');

      const health = await fetch(`${server.url}/healthz`); // 存活探针不需要令牌
      expect(health.status).toBe(200);
    } finally {
      await server.close();
    }
  });

  it('M8: 运行时入口端到端（装配 + /metrics + 一致性上报 + 幂等停止）', async () => {
    const runtime = await startRuntime({
      assembly: { store: new InMemorySkillStore() },
      port: 0,
      log: () => {},
      consistencySource: {
        snapshot: () => ({ selfOkSamples: 2, consistencyRate: 0.75, calibrationError: 0.1, mirageCount: 1 }),
      },
      consistencyIntervalMs: 0, // 只用首报，避免测试挂定时器
    });
    try {
      expect(runtime.metrics.agreementRatio.value()).toBeCloseTo(0.75);
      expect(runtime.metrics.mirageCount.value()).toBe(1);

      await publishTask(runtime.assembly.bus, 'trace-m8');
      const res = await fetch(`${runtime.server.url}/metrics`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('family_trajectory_bridge_events_total{result="accepted"} 1');
      expect(text).toContain('family_selfjudge_agreement_ratio 0.75');
    } finally {
      await runtime.stop();
    }

    // 幂等：二次停止不抛错；服务确已关闭
    await runtime.stop();
    let closed = false;
    try {
      await fetch(`${runtime.server.url}/metrics`);
    } catch {
      closed = true;
    }
    expect(closed).toBe(true);
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
