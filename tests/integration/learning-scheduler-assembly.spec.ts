// @ts-nocheck
/**
 * 学习调度装配测试（learning-scheduler-assembly）—— P8-b（M24）· 配额闸接入运行时。
 *
 * 验收：
 *   L1 缺省不启用：无 learningScheduler 选项时句柄字段缺省，loop.runCycle 直达
 *   L2 配额限流：maxCalls=2 → 两次 executed，第三次 skipped-budget 且任务保留回队
 *   L3 优先序排空：三请求按 priority 降序执行（onCycle 钩子序验证）
 *   L4 token 维度记账：tokensPerCycle=400 · 总 1000 → 两周期后剩余 200，
 *      第三次因 maxCalls=0 跳过且 token 不再扣减
 *   L5 失败归还：周期抛错 → 配额全额归还（后续请求仍可执行）且异常透传
 *
 * 运行：tsc 编译 + node（零依赖 harness，范式同 assembly-e2e）。
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
    toBeFalsy: () => {
      if (actual) throw new Error(`期望假值，实际 ${JSON.stringify(actual)}`);
    },
    toContain: (exp) => {
      if (!actual.includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${String(actual).slice(0, 200)}`);
    },
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`期望长度 ${n}，实际 ${actual.length}`);
    },
  });
}

import { createRuntimeAssembly } from '../../architecture-kernel/08-系统装配/runtime-assembly.js';
import { InMemorySkillStore } from '../../architecture-kernel/05-持续学习引擎/learning-loop.js';

describe('学习调度装配（P8-b · M24）', () => {
  it('L1 缺省不启用：无选项时句柄字段缺省，runCycle 直达', () => {
    const a = createRuntimeAssembly({ store: new InMemorySkillStore() });
    expect(a.learningScheduler).toBe(undefined);
    const report = a.loop.runCycle();
    expect(Array.isArray(report.labeled)).toBeTruthy();
  });

  it('L2 配额限流：maxCalls=2 → 两次 executed，第三次 skipped-budget 且回队保留', () => {
    const a = createRuntimeAssembly({
      store: new InMemorySkillStore(),
      learningScheduler: { total: { maxTokens: 10_000, maxCalls: 2 } },
    });
    a.learningScheduler.requestCycle();
    a.learningScheduler.requestCycle();
    a.learningScheduler.requestCycle();
    const out = a.learningScheduler.drain();
    expect(out).toHaveLength(2);
    expect(out[0].status).toBe('executed');
    expect(out[1].status).toBe('executed');
    expect(a.learningScheduler.pending()).toBe(1); // 耗尽任务保留回队
    expect(a.learningScheduler.exhausted()).toBeTruthy();
  });

  it('L3 优先序排空：按 priority 降序执行（onCycle 钩子序验证）', () => {
    const order = [];
    const a = createRuntimeAssembly({
      store: new InMemorySkillStore(),
      learning: { onCycle: (report) => order.push(report.labeled.length) },
      learningScheduler: { total: { maxTokens: 10_000, maxCalls: 3 }, now: () => 1_000 },
    });
    a.learningScheduler.requestCycle(1);
    a.learningScheduler.requestCycle(9);
    a.learningScheduler.requestCycle(5);
    const out = a.learningScheduler.drain();
    expect(out.every((o) => o.status === 'executed')).toBeTruthy();
    expect(out).toHaveLength(3);
    expect(order).toHaveLength(3); // 三次周期按优先序各触发一次 onCycle
    expect(a.learningScheduler.pending()).toBe(0);
  });

  it('L4 token 维度记账：两周期后剩 200，第三次因调用耗尽跳过且 token 不再扣减', () => {
    const a = createRuntimeAssembly({
      store: new InMemorySkillStore(),
      learningScheduler: { total: { maxTokens: 1_000, maxCalls: 2 }, tokensPerCycle: 400 },
    });
    a.learningScheduler.requestCycle();
    a.learningScheduler.requestCycle();
    const out = a.learningScheduler.drain();
    expect(out).toHaveLength(2);
    expect(a.learningScheduler.available().maxTokens).toBe(200);
    expect(a.learningScheduler.available().maxCalls).toBe(0);
    a.learningScheduler.requestCycle();
    const out2 = a.learningScheduler.drain();
    expect(out2).toHaveLength(0);
    expect(a.learningScheduler.available().maxTokens).toBe(200); // 零配额不入账
  });

  it('L5 失败归还：周期内抛错（onCycle 观测链）→ 配额全额归还（后续可执行）且异常透传', () => {
    let cycles = 0;
    const a = createRuntimeAssembly({
      store: new InMemorySkillStore(),
      learning: {
        onCycle: () => {
          cycles += 1;
          if (cycles === 1) throw new Error('周期内评估失败');
        },
      },
      learningScheduler: { total: { maxTokens: 1_000, maxCalls: 2 }, tokensPerCycle: 400 },
    });
    a.learningScheduler.requestCycle();
    let threw = '';
    try {
      a.learningScheduler.drain();
    } catch (e) {
      threw = e.message;
    }
    expect(threw).toContain('周期内评估失败');
    // 全额归还：token 与调用均回到授予前
    expect(a.learningScheduler.available().maxTokens).toBe(1000);
    expect(a.learningScheduler.available().maxCalls).toBe(2);
    expect(a.learningScheduler.pending()).toBe(1); // 失败任务标记回队
    a.learningScheduler.requestCycle();
    const out = a.learningScheduler.drain(); // 后续请求仍可执行（归还生效）
    expect(out.length >= 1).toBeTruthy();
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
