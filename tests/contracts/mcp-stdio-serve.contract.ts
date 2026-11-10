// @ts-nocheck
/**
 * MCP stdio 服务循环契约（mcp-stdio-serve）—— M41.5 · host 接入形态。
 *
 * 验收：
 *   H1 行协议服务：initialize → tools/list → tools/call（确定性臂）逐行响应，
 *      id 关联正确；stdout 仅协议帧（无日志混入）
 *   H2 容错：坏 JSON 行 → -32700 错误帧（服务不崩，后续请求照常）
 *   H3 host 断开：stdin close → 排空在途 → stop（进程退出路径由 main 持有）
 *   H4 就绪横幅走 stderr（stdout 协议纯净性）
 *
 * 运行：tsc 编译 + node（零依赖 harness，PassThrough 模拟 stdin/stdout）。
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
      if (!String(actual).includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${String(actual).slice(0, 300)}`);
    },
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`期望长度 ${n}，实际 ${actual.length}`);
    },
    toBeFalsy: () => {
      if (actual) throw new Error(`期望假值，实际 ${JSON.stringify(actual)}`);
    },
  });
}

import { PassThrough } from 'node:stream';
import { serveMcpStdio } from '../../family-agents/family-server.entry.js';

const ENTRIES = [
  { id: 'qianhang.intent-detection', name: '意图识别', description: '意图分类与路由', scope: 'dedicated', owner: '02', version: '1.0.0' },
];
const TOOLS = [{ name: 'qianhang__intent_detection', description: '意图识别', inputSchema: {} }];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

describe('MCP stdio 服务循环（M41.5 · host 接入）', () => {
  it('H1 行协议：initialize/tools/list/tools/call 逐行响应 · id 关联 · stdout 纯净', async () => {
    const server = await import('../../family-agents/family-server.entry.js').then((m) =>
      m.startFamilyServer({ serverInfo: { name: 'yyc3-family', version: 'test' }, tools: TOOLS, manifestEntries: ENTRIES }),
    );
    const input = new PassThrough();
    const frames = [];
    const output = new PassThrough();
    output.on('data', (c) => frames.push(...c.toString().split('\n').filter((l) => l.trim())));
    const rl = serveMcpStdio(server, { input, output });
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`);
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'qianhang__intent_detection', arguments: {} } })}\n`);
    await sleep(300);
    expect(frames.length).toBe(3);
    const byId = new Map(frames.map((f) => [JSON.parse(f).id, JSON.parse(f)]));
    expect(byId.get(1).result.serverInfo.name).toBe('yyc3-family');
    expect(byId.get(2).result.tools).toHaveLength(1); // 清单内唯一工具（意图识别）
    expect(byId.get(3).result.isError).toBeFalsy(); // 确定性臂执行成功
    // host 断开：stdin close → stop（U3/H3）
    input.end();
    await sleep(200);
    rl.close();
    await server.stop();
  });

  it('H2 容错：坏 JSON 行 → -32700 帧且服务不崩', async () => {
    const server = await import('../../family-agents/family-server.entry.js').then((m) =>
      m.startFamilyServer({ serverInfo: { name: 'yyc3-family', version: 'test' }, tools: TOOLS, manifestEntries: ENTRIES }),
    );
    const input = new PassThrough();
    const frames = [];
    const output = new PassThrough();
    output.on('data', (c) => frames.push(...c.toString().split('\n').filter((l) => l.trim())));
    const rl = serveMcpStdio(server, { input, output });
    input.write('this is not json\n');
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'ping' })}\n`);
    await sleep(200);
    expect(frames.length).toBe(2);
    const parseError = JSON.parse(frames[0]);
    expect(parseError.error.code).toBe(-32700);
    expect(JSON.parse(frames[1]).id).toBe(9);
    rl.close();
    input.end();
    await server.stop();
  });

  it('H4 就绪横幅走 stderr（stdout 协议纯净）', async () => {
    const server = await import('../../family-agents/family-server.entry.js').then((m) =>
      m.startFamilyServer({ serverInfo: { name: 'yyc3-family', version: 'test' }, tools: TOOLS, manifestEntries: ENTRIES }),
    );
    const errChunks = [];
    const origErr = console.error;
    console.error = (...a) => errChunks.push(a.join(' '));
    const input = new PassThrough();
    const outText = [];
    const output = new PassThrough();
    output.on('data', (c) => outText.push(c.toString()));
    const rl = serveMcpStdio(server, { input, output });
    await sleep(100);
    console.error = origErr;
    expect(errChunks.join('\n')).toContain('MCP stdio');
    expect(outText.join('')).toBe(''); // 无请求即无 stdout 输出（横幅未污染协议流）
    rl.close();
    await server.stop();
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
