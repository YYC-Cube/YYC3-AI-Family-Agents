// @ts-nocheck
/**
 * MCP streamable HTTP 传输契约（http-serve）—— P1-A3 · HTTP 常驻形态。
 *
 * 验收：
 *   W1 POST /mcp 请求-响应：initialize/tools/list 帧正确 · id 关联
 *   W2 路由闸：非 POST 或非 /mcp → 404（不泄露协议面）
 *   W3 容错：坏 JSON → -32700 帧（服务不崩）
 *   W4 close()：优雅关闭后连接被拒
 *
 * 运行：tsc 编译 + node（零依赖 harness，程序化 startFamilyServer + serveMcpHttp，范式同 mcp-stdio-serve）。
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
      if (!String(actual).includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${String(actual).slice(0, 300)}`);
    },
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`期望长度 ${n}，实际 ${actual.length}`);
    },
  });
}

import http from 'node:http';

const ENTRIES = [
  { id: 'qianhang.intent-detection', name: '意图识别', description: '意图分类与路由', scope: 'dedicated', owner: '010301-01', version: '1.0.0' },
];
const TOOLS = [{ name: 'qianhang__intent_detection', description: '意图识别', inputSchema: {} }];

function request(url, payload) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
      let text = '';
      res.on('data', (c) => {
        text += c;
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

describe('MCP streamable HTTP 传输（P1-A3）', () => {
  it('W1 请求-响应：initialize/tools/list 帧正确 · id 关联', async () => {
    const mod = await import('../../family-agents/family-server.entry.js');
    const server = await mod.startFamilyServer({
      serverInfo: { name: 'yyc3-family', version: 'test' },
      tools: TOOLS,
      manifestEntries: ENTRIES,
      metricsServer: { port: 0 },
    });
    const h = await mod.serveMcpHttp(server, { port: 0 });
    const init = await request(h.url, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
    expect(init.status).toBe(200);
    const initFrame = JSON.parse(init.text);
    expect(initFrame.id).toBe(1);
    expect(initFrame.result.serverInfo.name).toBe('yyc3-family');
    const listed = await request(h.url, JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
    const listFrame = JSON.parse(listed.text);
    expect(listFrame.id).toBe(2);
    expect(listFrame.result.tools).toHaveLength(1);
    await h.close();
    await server.stop();
  });

  it('W2 路由闸：GET /mcp → 404 · 非 /mcp 路径 → 404（不泄露协议面）', async () => {
    const mod = await import('../../family-agents/family-server.entry.js');
    const server = await mod.startFamilyServer({
      serverInfo: { name: 'yyc3-family', version: 'test' },
      tools: TOOLS,
      manifestEntries: ENTRIES,
      metricsServer: { port: 0 },
    });
    const h = await mod.serveMcpHttp(server, { port: 0 });
    const base = h.url.replace(/\/mcp$/, '');
    const getRes = await new Promise((resolve, reject) => {
      const req = http.request(`${base}/mcp`, { method: 'GET' }, (res) => {
        let t = '';
        res.on('data', (c) => {
          t += c;
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text: t }));
      });
      req.on('error', reject);
      req.end();
    });
    expect(getRes.status).toBe(404);
    const wrongPath = await request(`${base}/other`, JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'ping' }));
    expect(wrongPath.status).toBe(404);
    await h.close();
    await server.stop();
  });

  it('W3 容错：坏 JSON → -32700 帧（服务不崩）', async () => {
    const mod = await import('../../family-agents/family-server.entry.js');
    const server = await mod.startFamilyServer({
      serverInfo: { name: 'yyc3-family', version: 'test' },
      tools: TOOLS,
      manifestEntries: ENTRIES,
      metricsServer: { port: 0 },
    });
    const h = await mod.serveMcpHttp(server, { port: 0 });
    const bad = await request(h.url, 'this is not json');
    expect(bad.status).toBe(200);
    const frame = JSON.parse(bad.text);
    expect(frame.error.code).toBe(-32700);
    // 服务不崩：后续请求照常
    const ping = await request(h.url, JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' }));
    expect(JSON.parse(ping.text).id).toBe(7);
    await h.close();
    await server.stop();
  });

  it('W4 close()：优雅关闭后连接被拒', async () => {
    const mod = await import('../../family-agents/family-server.entry.js');
    const server = await mod.startFamilyServer({
      serverInfo: { name: 'yyc3-family', version: 'test' },
      tools: TOOLS,
      manifestEntries: ENTRIES,
      metricsServer: { port: 0 },
    });
    const h = await mod.serveMcpHttp(server, { port: 0 });
    await h.close();
    let refused = false;
    try {
      await request(h.url, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }));
    } catch {
      refused = true;
    }
    expect(refused).toBeTruthy();
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
