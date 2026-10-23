// @ts-nocheck
/**
 * MCP 适配层契约测试（mcp-adapter.spec）—— P1-T3。
 * 覆盖：
 *   1) 编解码：BusEvent ↔ MCP JSON-RPC 通知的往返与非法输入拒绝
 *   2) 总线接入：register / encodeForMcp / ingestMcp（含脏消息入 DLQ）
 *   3) stdio 传输：真实本地子进程的请求-响应、入站通知、脏行错误上报、优雅关闭
 * 特性：全程本地、无网络、无第三方依赖；子进程用 `process.execPath -e`。
 */

import { EventBus } from '../../architecture-kernel/02-云枢核心引擎/family-communication-bus/event-bus.js';
import { BusMcpCodec } from '../../architecture-kernel/02-云枢核心引擎/mcp-adapter/bus-mcp-codec.js';
import { StdioMcpTransport } from '../../architecture-kernel/02-云枢核心引擎/mcp-adapter/stdio-transport.js';

const now = 1_700_000_000_000;

function makeEvent(overrides = {}) {
  return {
    key: { traceId: 'trace-mcp-1', agentId: '010301-01', seq: 1 },
    topic: 'mcp.in',
    mode: 'broadcast',
    payload: { text: '分析本月成本' },
    at: now,
    ...overrides,
  };
}

/** 轮询等待条件成立（有上限，避免悬挂）。 */
async function waitFor(predicate, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return predicate();
}

// ---------- 零依赖 harness ----------

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
    toThrow: (pattern) => {
      let thrown = null;
      try {
        actual();
      } catch (error) {
        thrown = error;
      }
      if (!thrown) throw new Error('期望抛出异常，实际未抛出');
      if (pattern && !pattern.test(thrown.message)) {
        throw new Error(`异常信息不匹配 ${pattern}：${thrown.message}`);
      }
    },
  });
}

/** 子进程：逐行解析，回显 echo、转发 notify、对 bad 输出脏行。 */
const CHILD_SCRIPT = `
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin });
const out = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
rl.on('line', (line) => {
  if (line.trim() === '') return;
  let msg;
  try { msg = JSON.parse(line); } catch { process.stdout.write('not-json\\n'); return; }
  if (msg.method === 'echo') out({ jsonrpc: '2.0', id: msg.id, result: { ok: true, echo: msg.params ?? null } });
  else if (msg.method === 'notify') out({ jsonrpc: '2.0', method: 'yyc3/event', params: msg.params });
  else if (msg.method === 'bad') process.stdout.write('not-json\\n');
});
`;

describe('MCP 适配层（P1-T3）', () => {
  it('codec 编码为 JSON-RPC 2.0 通知', () => {
    const codec = new BusMcpCodec({ id: 'bus' });
    const message = codec.encode(makeEvent());
    globalThis.expect(message.jsonrpc).toBe('2.0');
    globalThis.expect(message.method).toBe('yyc3/event');
    globalThis.expect(message.params.topic).toBe('mcp.in');
    globalThis.expect('id' in message).toBe(false);
  });

  it('codec 往返字段保真', () => {
    const codec = new BusMcpCodec();
    const source = makeEvent();
    const decoded = codec.decode(JSON.parse(JSON.stringify(codec.encode(source))));
    globalThis.expect(JSON.stringify(decoded)).toBe(JSON.stringify(source));
  });

  it('codec 拒绝非 JSON-RPC / 未知 method / 缺点对点 target', () => {
    const codec = new BusMcpCodec();
    globalThis.expect(() => codec.decode({ jsonrpc: '1.0', method: 'yyc3/event' })).toThrow(/JSON-RPC/);
    globalThis.expect(() => codec.decode({ jsonrpc: '2.0', method: 'other', params: {} })).toThrow(/不支持的方法/);
    globalThis.expect(() => codec.encode(makeEvent({ mode: 'point-to-point' }))).toThrow(/target/);
  });

  it('总线拒绝重复注册适配器', () => {
    const bus = new EventBus();
    bus.registerMcpAdapter(new BusMcpCodec({ id: 'bus' }));
    globalThis.expect(() => bus.registerMcpAdapter(new BusMcpCodec({ id: 'bus' }))).toThrow(/重复注册/);
    globalThis.expect(bus.mcpAdapterIds().join(',')).toBe('bus');
  });

  it('入站合法消息解码后投递到总线', async () => {
    const bus = new EventBus({ now: () => now });
    const codec = new BusMcpCodec();
    bus.registerMcpAdapter(codec);
    const received = [];
    bus.subscribe('mcp.in', (event) => received.push(event));

    const event = await bus.ingestMcp('bus', codec.encode(makeEvent()));

    globalThis.expect(received.length).toBe(1);
    globalThis.expect(received[0].key.traceId).toBe('trace-mcp-1');
    globalThis.expect(event?.topic).toBe('mcp.in');
  });

  it('入站脏消息写入 DLQ 且不投递', async () => {
    const bus = new EventBus({ now: () => now });
    bus.registerMcpAdapter(new BusMcpCodec());
    const received = [];
    bus.subscribe('mcp.in', (event) => received.push(event));

    const result = await bus.ingestMcp('bus', { jsonrpc: '1.0', hello: 'world' });
    const letters = bus.deadLetters();

    globalThis.expect(result).toBe(undefined);
    globalThis.expect(received.length).toBe(0);
    globalThis.expect(letters.length).toBe(1);
    globalThis.expect(letters[0].topic).toBe('mcp.undecodable');
    globalThis.expect(letters[0].error.length > 0).toBe(true);
  });

  it('出站编码要求适配器已注册', () => {
    const bus = new EventBus();
    globalThis.expect(() => bus.encodeForMcp('missing', makeEvent())).toThrow(/未注册/);
  });

  it('stdio 传输完成请求-响应与入站通知', async () => {
    const transport = new StdioMcpTransport({
      command: process.execPath,
      args: ['-e', CHILD_SCRIPT],
      requestTimeoutMs: 3000,
      shutdownGraceMs: 300,
    });
    const messages = [];
    const errors = [];
    transport.onMessage((message) => messages.push(message));
    transport.onError((error) => errors.push(error));

    const echoed = await transport.request('echo', { a: 1 });
    globalThis.expect(echoed.ok).toBe(true);
    globalThis.expect(echoed.echo.a).toBe(1);

    transport.send({ jsonrpc: '2.0', method: 'notify', params: { hello: 'world' } });
    const gotNotification = await waitFor(() => messages.length > 0);
    globalThis.expect(gotNotification).toBe(true);
    globalThis.expect(messages[0].params.hello).toBe('world');

    await transport.close();
    globalThis.expect(errors.length).toBe(0);
  });

  it('stdio 传输将脏行上报为错误而不中断', async () => {
    const transport = new StdioMcpTransport({
      command: process.execPath,
      args: ['-e', CHILD_SCRIPT],
      requestTimeoutMs: 3000,
      shutdownGraceMs: 300,
    });
    const errors = [];
    transport.onError((error) => errors.push(error));

    transport.send({ jsonrpc: '2.0', method: 'bad' });
    const reported = await waitFor(() => errors.length > 0);
    globalThis.expect(reported).toBe(true);
    globalThis.expect(/解析失败/.test(errors[0].message)).toBe(true);

    await transport.close();
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
  console.log(`结果：${passed} 通过 / ${failures.length} 失败 / ${queue.length - passed - failures.length} 跳过 / 共 ${queue.length} 例`);
  if (failures.length > 0) process.exit(1);
})();
