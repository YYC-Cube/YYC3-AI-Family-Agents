// @ts-nocheck
/**
 * MCP 服务端协议语义测试（mcp-server.spec）—— P3-MCP。
 * 门禁映射：无状态 JSON-RPC 分派（initialize / ping / tools/list）与错误码路径。
 * 设计：纯函数级验证（不 spawn 进程）；工具目录由测试注入，零网络。
 */

import { createMcpRequestHandler, MCP_PROTOCOL_VERSION, parseTraceparent } from '../../architecture-kernel/02-云枢核心引擎/mcp-adapter/server/protocol.js';

const TOOLS = [
  {
    name: 'qianhang__intent_detection',
    description: '六类意图闭集识别（家族 id `.` → `__` 映射示例）',
    inputSchema: { type: 'object', required: ['USER_TEXT'], properties: { USER_TEXT: { type: 'string' } } },
  },
  {
    name: 'shared_self-judge',
    description: '结构化自判断',
    inputSchema: { type: 'object', properties: {} },
  },
];

const handler = createMcpRequestHandler({
  serverInfo: { name: 'yyc3-family-agent', version: '2.16.0' },
  tools: TOOLS,
});

// ---------- 零依赖 harness（输出汇总行供门禁解析） ----------

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
    toMatch: (re) => {
      if (!re.test(String(actual))) throw new Error(`期望匹配 ${re}，实际 ${JSON.stringify(actual)}`);
    },
    toBeTruthy: () => {
      if (!actual) throw new Error(`期望真值，实际 ${JSON.stringify(actual)}`);
    },
  });
}

describe('MCP 服务端协议语义（P3-MCP）', () => {
  it('initialize：返回协议版本 + tools 能力 + serverInfo 回显', () => {
    const res = JSON.parse(handler.handle('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'));
    globalThis.expect(res.jsonrpc).toBe('2.0');
    globalThis.expect(res.id).toBe(1);
    globalThis.expect(res.result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    globalThis.expect(res.result.protocolVersion).toBe('2026-07-28');
    globalThis.expect(res.result.capabilities.tools.listChanged).toBe(false);
    globalThis.expect(res.result.serverInfo.name).toBe('yyc3-family-agent');
  });

  it('tools/list：注入目录原样返回，工具名符合 MCP 命名', () => {
    const res = JSON.parse(handler.handle('{"jsonrpc":"2.0","id":"a-2","method":"tools/list"}'));
    globalThis.expect(res.id).toBe('a-2');
    globalThis.expect(res.result.tools.length).toBe(2);
    globalThis.expect(res.result.tools[0].name).toBe('qianhang__intent_detection');
    globalThis.expect(res.result.tools[0].inputSchema.required[0]).toBe('USER_TEXT');
    for (const t of res.result.tools) globalThis.expect(t.name).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it('未知方法：请求回 -32601（id 关联）', () => {
    const res = JSON.parse(handler.handle('{"jsonrpc":"2.0","id":7,"method":"resources/list"}'));
    globalThis.expect(res.id).toBe(7);
    globalThis.expect(res.error.code).toBe(-32601);
  });

  it('通知（无 id）：静默不产生响应行', () => {
    globalThis.expect(handler.handle('{"jsonrpc":"2.0","method":"notifications/initialized"}')).toBe(null);
    // 未知方法的通知同样静默（JSON-RPC 规范）
    globalThis.expect(handler.handle('{"jsonrpc":"2.0","method":"tools/call","params":{}}')).toBe(null);
  });

  it('非法 JSON / 非法请求：-32700 / -32600（id 为 null）', () => {
    const parseErr = JSON.parse(handler.handle('{not-json'));
    globalThis.expect(parseErr.id).toBe(null);
    globalThis.expect(parseErr.error.code).toBe(-32700);
    const invalid = JSON.parse(handler.handle('{"jsonrpc":"2.0","id":3}'));
    globalThis.expect(invalid.error.code).toBe(-32600);
  });

  it('ping：空对象结果且无状态（同输入恒同输出）', () => {
    const a = JSON.parse(handler.handle('{"jsonrpc":"2.0","id":9,"method":"ping"}'));
    const b = JSON.parse(handler.handle('{"jsonrpc":"2.0","id":9,"method":"ping"}'));
    if (a.result === undefined || JSON.stringify(a) !== JSON.stringify(b)) throw new Error('ping 非幂等');
    if (a.id !== 9) throw new Error('ping id 关联失败');
  });

  it('异步分派（M16）：dispatch 返回 thenable 时 handle 返回 Promise，成功结果与同步路径同构', async () => {
    const asyncHandler = createMcpRequestHandler({
      serverInfo: { name: 's', version: '1' },
      tools: TOOLS,
      dispatch: (ctx) => Promise.resolve({ echoed: ctx.toolName }),
    });
    const out = asyncHandler.handle(
      JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: TOOLS[0].name, arguments: {} } }),
    );
    if (typeof (out && out.then) !== 'function') throw new Error('异步分派应返回 Promise');
    const res = JSON.parse(await out);
    if (res.id !== 11 || res.result.isError !== false || !res.result.content[0].text.includes(TOOLS[0].name)) {
      throw new Error(`异步成功路径结果异常：${JSON.stringify(res).slice(0, 200)}`);
    }
  });

  it('异步分派（M16）：dispatch Promise 拒绝 → isError 结果（协议层不炸）', async () => {
    const asyncHandler = createMcpRequestHandler({
      serverInfo: { name: 's', version: '1' },
      tools: TOOLS,
      dispatch: () => Promise.reject(new Error('异步执行失败')),
    });
    const res = JSON.parse(
      await asyncHandler.handle(
        JSON.stringify({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: TOOLS[0].name, arguments: {} } }),
      ),
    );
    if (res.result.isError !== true || !res.result.content[0].text.includes('异步执行失败')) {
      throw new Error(`异步拒绝路径结果异常：${JSON.stringify(res).slice(0, 200)}`);
    }
  });

  it('W3C traceparent（M21）：合法头派生 traceId 进 ctx，非法头按未携带处理', () => {
    // 纯解析语义锚点
    const good = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    if (!good || good.traceId !== '4bf92f3577b34da6a3ce929d0e0e4736' || good.spanId !== '00f067aa0ba902b7') {
      throw new Error('合法 traceparent 解析失败');
    }
    if (parseTraceparent('ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01') !== null) throw new Error('版本 ff 应拒绝');
    if (parseTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01') !== null) throw new Error('全零 traceId 应拒绝');
    if (parseTraceparent('不是头') !== null) throw new Error('乱串应拒绝');

    // ctx 传播：_meta.traceparent 派生 traceId（无显式 traceId 时）；dispatch 可见 traceparent
    let seen = {};
    const h = createMcpRequestHandler({
      serverInfo: { name: 's', version: '1' },
      tools: TOOLS,
      dispatch: (ctx) => ((seen = ctx), {}),
    });
    h.handle(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 21,
        method: 'tools/call',
        params: { name: TOOLS[0].name, arguments: {}, _meta: { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' } },
      }),
    );
    if (seen.traceId !== '4bf92f3577b34da6a3ce929d0e0e4736' || seen.traceparent?.spanId !== '00f067aa0ba902b7') {
      throw new Error(`traceparent 未派生 traceId/未透传 ctx：${JSON.stringify(seen).slice(0, 200)}`);
    }
    // 显式 traceId 优先于派生
    h.handle(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 22,
        method: 'tools/call',
        params: { name: TOOLS[0].name, arguments: {}, _meta: { traceId: 'explicit-1', traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' } },
      }),
    );
    if (seen.traceId !== 'explicit-1') throw new Error('显式 traceId 应优先');
    // 非法头：traceId 缺省（undefined）且无 traceparent 字段
    h.handle(
      JSON.stringify({ jsonrpc: '2.0', id: 23, method: 'tools/call', params: { name: TOOLS[0].name, arguments: {}, _meta: { traceparent: 'bad' } } }),
    );
    if (seen.traceId !== undefined || seen.traceparent !== undefined) throw new Error('非法 traceparent 应按未携带处理');
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
