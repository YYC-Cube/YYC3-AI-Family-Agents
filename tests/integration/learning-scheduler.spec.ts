// @ts-nocheck
/**
 * 学习调度器测试（learning-scheduler）—— P8-a（M23）· 配额与队列由桩转实。
 *
 * 验收：
 *   S1 队列有序：priority 降序出队；同分 FIFO 稳定；peek/list 不取出
 *   S2 配额授予：min(申请, 剩余) 分别取维度；授予即预扣；available 实时
 *   S3 耗尽与归还：任一维度归零 → 零配额不入账；release 归还后可再授予
 *   S4 非法输入：负总额构造即抛；非正申请 → 零配额
 *   S5 调度闭环：高优先级先获配额执行 → 耗尽后任务入队等待 → release 唤醒再执行
 *
 * 运行：tsc 编译 + node（零依赖 harness，范式同本目录既有套件）。
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

import { LearningPriorityQueue } from '../../architecture-kernel/05-持续学习引擎/learning-scheduler/priority-queue.js';
import { BudgetAllocator, ZERO_BUDGET } from '../../architecture-kernel/05-持续学习引擎/learning-scheduler/budget-allocator.js';

const task = (id, priority, maxTokens = 100, maxCalls = 1) => ({
  id,
  mode: 'skill-consolidation',
  priority,
  budget: { maxTokens, maxCalls },
  status: 'pending',
});

describe('学习调度器（P8-a · M23）', () => {
  it('S1 队列有序：priority 降序出队；同分 FIFO 稳定；peek/list 不取出', () => {
    const q = new LearningPriorityQueue();
    q.enqueue(task('low', 1));
    q.enqueue(task('high', 9));
    q.enqueue(task('mid-a', 5));
    q.enqueue(task('mid-b', 5)); // 同分后入
    expect(q.dequeue().id).toBe('high');
    expect(q.peek().id).toBe('mid-a'); // 只看不取
    expect(q.size()).toBe(3);
    expect(q.dequeue().id).toBe('mid-a'); // 同分 FIFO
    expect(q.dequeue().id).toBe('mid-b');
    expect(q.list()).toHaveLength(1);
    expect(q.dequeue().id).toBe('low');
    expect(q.dequeue()).toBe(undefined);
  });

  it('S2 配额授予：min(申请, 剩余) 分维度取值；授予即预扣；available 实时', () => {
    const alloc = new BudgetAllocator({ maxTokens: 1000, maxCalls: 10 });
    const g1 = alloc.allocate(task('t1', 5, 400, 4));
    expect(g1.maxTokens).toBe(400);
    expect(g1.maxCalls).toBe(4);
    expect(alloc.available.maxTokens).toBe(600);
    // 申请超剩余 → 截断为剩余（分维度）
    const g2 = alloc.allocate(task('t2', 5, 700, 8));
    expect(g2.maxTokens).toBe(600);
    expect(g2.maxCalls).toBe(6);
    expect(alloc.available.maxTokens).toBe(0);
    expect(alloc.available.maxCalls).toBe(0);
  });

  it('S3 耗尽与归还：任一维度归零 → 零配额不入账；release 归还后可再授予', () => {
    const alloc = new BudgetAllocator({ maxTokens: 100, maxCalls: 1 });
    const g1 = alloc.allocate(task('t1', 5, 100, 1));
    expect(g1.maxCalls).toBe(1);
    expect(alloc.exhausted).toBeTruthy();
    const g2 = alloc.allocate(task('t2', 9, 50, 1));
    expect(g2).toBe(ZERO_BUDGET);
    expect(g2.maxTokens).toBe(0);
    expect(alloc.available.maxCalls).toBe(0); // 零配额未入账
    alloc.release({ maxTokens: 100, maxCalls: 1 }); // 执行失败全额归还
    const g3 = alloc.allocate(task('t3', 1, 80, 1));
    expect(g3.maxTokens).toBe(80);
    expect(g3.maxCalls).toBe(1);
  });

  it('S4 非法输入：负总额构造即抛；非正申请 → 零配额', () => {
    let threw = '';
    try {
      new BudgetAllocator({ maxTokens: -1, maxCalls: 1 });
    } catch (e) {
      threw = e.message;
    }
    expect(threw).toContain('总配额不可为负');
    const alloc = new BudgetAllocator({ maxTokens: 100, maxCalls: 1 });
    expect(alloc.allocate(task('zero-ask', 5, 0, 1))).toBe(ZERO_BUDGET);
    expect(alloc.allocate(task('neg-ask', 5, 10, -2))).toBe(ZERO_BUDGET);
  });

  it('S5 调度闭环：优先序执行 + 失败归还唤醒后续任务（零配额即回队等待）', () => {
    const alloc = new BudgetAllocator({ maxTokens: 300, maxCalls: 2 });
    const queue = new LearningPriorityQueue();
    queue.enqueue(task('t-low', 1, 200, 1));
    queue.enqueue(task('t-high', 8, 200, 1));
    queue.enqueue(task('t-wait', 5, 200, 1));

    // 循环：按优先级出队 → 申请配额 → 零配额回队等待；执行者半途失败归还一半 token + 全部调用
    const executed = [];
    const released = [];
    for (let round = 0; round < 3 && queue.size() > 0; round += 1) {
      const t = queue.dequeue();
      const granted = alloc.allocate(t);
      if (granted === ZERO_BUDGET) {
        queue.enqueue(t);
        continue;
      }
      executed.push(t.id);
      alloc.release({ maxTokens: granted.maxTokens / 2, maxCalls: granted.maxCalls });
      released.push(t.id);
    }
    // 优先序保持（high > wait > low）；low 仅在前两者归还后获配额（release 唤醒语义）
    expect(executed.join(',')).toBe('t-high,t-wait,t-low');
    expect(released).toHaveLength(3);
    expect(queue.size()).toBe(0);
    // 全部执行后剩余 = 总量 − Σ(每次消耗授予的一半 token)：300 − (100+100+50) = 50；调用全归还
    expect(alloc.available.maxTokens).toBe(50);
    expect(alloc.available.maxCalls).toBe(2);
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
