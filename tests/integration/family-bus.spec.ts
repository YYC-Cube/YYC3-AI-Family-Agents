// @ts-nocheck
/**
 * 家族通信总线集成测试（family-bus）—— 真实断言版（v2.7.2，验收 L4）。
 * 覆盖：发布订阅 / 幂等去重 / 点对点路由；死信队列（DLQ）未实现 → 显式跳过（不再静默）。
 * 对应架构：§4 云枢核心引擎 family-communication-bus。
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
  globalThis.it.skip = (name, reason) => {
    globalThis.__queue.push({ name: `${globalThis.__suiteName ?? ''} > ${name}`, skip: true, reason });
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
  });
}

import { EventBus } from '../../02-智能协同架构内核/02-云枢核心引擎/family-communication-bus/event-bus.js';

/** 构造一条总线事件。 */
function makeEvent({ traceId = 't1', agentId = 'qianhang', seq = 1, topic = 'task.executed', mode = 'broadcast', target } = {}) {
  return {
    key: { traceId, agentId, seq },
    topic,
    mode,
    target,
    payload: { traceId, ok: true },
    at: 1000,
  };
}

describe('family-bus 事件链路（发布 → 幂等 → 路由）', () => {
  it('事件发布：订阅方收到同一 traceId 与载荷', async () => {
    const bus = new EventBus();
    const received = [];
    bus.subscribe('task.executed', (e) => received.push(e));

    await bus.publish(makeEvent({ traceId: 'trace-bus-1' }));

    expect(received).toHaveLength(1);
    expect(received[0].key.traceId).toBe('trace-bus-1');
    expect(received[0].payload.traceId).toBe('trace-bus-1');
  });

  it('幂等去重：相同幂等键（traceId+agentId+seq）重复投递仅消费一次', async () => {
    const bus = new EventBus();
    let count = 0;
    bus.subscribe('task.executed', () => {
      count += 1;
    });

    await bus.publish(makeEvent());
    await bus.publish(makeEvent());
    await bus.publish(makeEvent());

    expect(count).toBe(1);
  });

  it('幂等粒度：seq 不同视为不同事件（同一 traceId 可多次投递）', async () => {
    const bus = new EventBus();
    let count = 0;
    bus.subscribe('task.executed', () => {
      count += 1;
    });

    await bus.publish(makeEvent({ seq: 1 }));
    await bus.publish(makeEvent({ seq: 2 }));

    expect(count).toBe(2);
  });

  it('点对点路由：mode=point-to-point 仅投递 target 主题', async () => {
    const bus = new EventBus();
    let a = 0;
    let b = 0;
    bus.subscribe('topic-a', () => {
      a += 1;
    });
    bus.subscribe('topic-b', () => {
      b += 1;
    });

    await bus.publish(makeEvent({ topic: 'task.executed', mode: 'point-to-point', target: 'topic-a' }));

    expect(a).toBe(1);
    expect(b).toBe(0);
  });

  it.skip('死信：超过最大重试次数后事件进入 DLQ', 'EventBus 尚无重试/DLQ 实现（TODO(infra)：对接 07-自愈中心）');
});

(async () => {
  const queue = globalThis.__queue ?? [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const t of queue) {
    if (t.skip) {
      skipped += 1;
      console.log(`SKIP ${t.name}\n      原因：${t.reason}`);
      continue;
    }
    try {
      await t.fn();
      passed += 1;
      console.log(`PASS ${t.name}`);
    } catch (e) {
      failed += 1;
      console.log(`FAIL ${t.name}\n      ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\n结果：${passed} 通过 / ${failed} 失败 / ${skipped} 跳过 / 共 ${queue.length} 例`);
  if (failed > 0) process.exit(1);
})();
