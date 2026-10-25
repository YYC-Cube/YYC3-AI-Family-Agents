// @ts-nocheck
/**
 * 家族服务装配测试（family-server-assembly）—— P6-A（M14）。
 *
 * 验收：
 *   A1 工具名 ↔ logicalId 逆映射（gen-mcp-tools `.`→`__`、`-`→`_` 的逆变换锚点）
 *   A2 端到端装配：manifest 装载记账（skills_loaded）→ tools/list → tools/call ok 计账
 *   A3 observe 未准入：放行留痕（审计链 1 条）且 plugin_denied 不计
 *   A4 enforce 未准入：isError 拒绝 + plugin_denied 计账 + dispatch 不进入（ok/error 均 0）
 *   A5 未注册技能：introspection 分派抛错 → isError + error 计账
 *   A6 /metrics 真值：HTTP 暴露含能力供给三族样本行；stop 幂等
 *   A7 零指标装配：metrics 未注入时治理链照常（enforce 拒绝），不抛不记
 *
 * 运行：tsc 编译 + node（零依赖 harness，范式同 capability-instrumentation）。
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

import { assembleMcpServer } from '../../architecture-kernel/08-系统装配/mcp-server-assembly.js';
import { ComplianceAudit } from '../../architecture-kernel/06-治理中心/compliance-audit/compliance-audit.js';
import { startFamilyServer, logicalIdOfTool } from '../../family-agents/family-server.entry.js';

/** 内联清单（hermetic）：2 active + 1 planned；id 与工具名按 gen-mcp-tools 映射对齐。 */
const ENTRIES = [
  { id: 'shared.a2a-delegate', name: 'A2A 委托', description: '外部家人任务委托', scope: 'shared', version: '1.0.0' },
  { id: 'qianhang.intent-detection', name: '意图识别', description: '意图分类与路由', scope: 'dedicated', owner: '02', version: '1.0.0' },
  { id: 'shared.reserved-skill', name: '预留', description: '未实装', scope: 'shared', version: '1.0.0', status: 'planned' },
];

const TOOLS = [
  { name: 'shared__a2a_delegate', description: 'A2A 委托', inputSchema: {}, logicalId: 'shared.a2a-delegate' },
  { name: 'qianhang__intent_detection', description: '意图识别', inputSchema: {}, logicalId: 'qianhang.intent-detection' },
];

const SERVER_INFO = { name: 'yyc3-family', version: 'test' };

const call = (server, name, meta) =>
  JSON.parse(
    server.mcp.handler.handle(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: {}, ...(meta ? { _meta: meta } : {}) },
      }),
    ),
  );

describe('家族服务装配（P6-A · M14）', () => {
  it('A1 工具名 ↔ logicalId 逆映射锚点（`.`→`__`、`-`→`_` 的逆变换）', () => {
    expect(logicalIdOfTool('qianhang__intent_detection')).toBe('qianhang.intent-detection');
    expect(logicalIdOfTool('shared__a2a_delegate')).toBe('shared.a2a-delegate');
    expect(logicalIdOfTool('bole__achievement_insight')).toBe('bole.achievement-insight');
  });

  it('A2 端到端装配：装载记账 → tools/list → tools/call ok 计账', async () => {
    const server = await startFamilyServer({
      serverInfo: SERVER_INFO,
      tools: TOOLS,
      manifestEntries: ENTRIES,
    });

    expect(server.registry.list()).toHaveLength(2); // planned 跳过
    const listed = JSON.parse(server.mcp.handler.handle(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })));
    expect(listed.result.tools).toHaveLength(2);

    const ok = call(server, 'shared__a2a_delegate', { traceId: 't-a2', actor: 'tester' });
    expect(ok.result.isError).toBe(false);
    expect(ok.result.content[0].text).toContain('shared.a2a-delegate');

    const text = server.metrics.render();
    expect(text).toContain('family_capability_skills_loaded_total{skill="shared.a2a-delegate"} 1');
    expect(text).toContain('family_capability_skills_loaded_total{skill="qianhang.intent-detection"} 1');
    expect(text).toContain('family_capability_mcp_tool_calls_total{result="ok"} 1');
    await server.stop();
  });

  it('A3 observe 未准入：放行留痕（审计 1 条）且 plugin_denied 不计', async () => {
    const audit = new ComplianceAudit();
    const server = await startFamilyServer({
      serverInfo: SERVER_INFO,
      tools: TOOLS,
      manifestEntries: ENTRIES.slice(0, 1),
      admission: { allowed: ['family-core'], mode: 'observe', audit },
      pluginOfTool: () => 'rogue-pack',
    });

    const res = call(server, 'shared__a2a_delegate', { traceId: 't-obs' });
    expect(res.result.isError).toBe(false); // observe 放行
    expect(server.mcp.allowlist.auditRecords).toHaveLength(1);
    expect(server.mcp.allowlist.auditRecords[0].traceId).toBe('t-obs');
    expect(server.mcp.allowlist.observedCount).toBe(1);
    expect(server.metrics.capabilityPluginDenied.value({ plugin: 'rogue-pack' })).toBe(0);
    await server.stop();
  });

  it('A4 enforce 未准入：isError 拒绝 + plugin_denied 计账 + dispatch 不进入', async () => {
    const server = await startFamilyServer({
      serverInfo: SERVER_INFO,
      tools: TOOLS,
      manifestEntries: ENTRIES.slice(0, 1),
      admission: { allowed: ['family-core'], mode: 'enforce' },
      pluginOfTool: () => 'rogue-pack',
    });

    const res = call(server, 'shared__a2a_delegate', { traceId: 't-deny' });
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain('未准入');
    expect(server.mcp.allowlist.rejectedCount).toBe(1);
    expect(server.metrics.capabilityPluginDenied.value({ plugin: 'rogue-pack' })).toBe(1);
    // 策略拒绝不进入 dispatch：ok / error 均不计数（§6.3 口径）
    expect(server.metrics.capabilityMcpToolCalls.value({ result: 'ok' })).toBe(0);
    expect(server.metrics.capabilityMcpToolCalls.value({ result: 'error' })).toBe(0);
    await server.stop();
  });

  it('A5 未注册技能：introspection 分派抛错 → isError + error 计账', async () => {
    const server = await startFamilyServer({
      serverInfo: SERVER_INFO,
      tools: TOOLS,
      manifestEntries: ENTRIES.slice(0, 1),
    });

    const res = call(server, 'qianhang__intent_detection'); // 未装载（entries 只取 1 条）
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain('未注册技能');
    expect(server.metrics.capabilityMcpToolCalls.value({ result: 'error' })).toBe(1);
    await server.stop();
  });

  it('A6 /metrics 真值：HTTP 暴露含能力供给三族样本；stop 幂等', async () => {
    const server = await startFamilyServer({
      serverInfo: SERVER_INFO,
      tools: TOOLS,
      manifestEntries: ENTRIES.slice(0, 1),
      metricsServer: { port: 0 },
    });

    call(server, 'shared__a2a_delegate');
    const res = await fetch(`${server.metricsServer.url}/metrics`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('# TYPE family_capability_skills_loaded_total counter');
    expect(text).toContain('family_capability_skills_loaded_total{skill="shared.a2a-delegate"} 1');
    expect(text).toContain('family_capability_mcp_tool_calls_total{result="ok"} 1');

    await server.stop();
    await server.stop(); // 幂等：二次停止不抛
  });

  it('A7 零指标装配：metrics 未注入时治理链照常（enforce 拒绝），不抛不记', () => {
    const assembly = assembleMcpServer({
      serverInfo: SERVER_INFO,
      tools: TOOLS,
      admission: { allowed: [], mode: 'enforce' },
      dispatch: () => ({ never: true }),
    });
    const res = JSON.parse(
      assembly.handler.handle(
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'shared__a2a_delegate', arguments: {} } }),
      ),
    );
    expect(res.result.isError).toBe(true);
    expect(assembly.allowlist.rejectedCount).toBe(1);
  });

  it('A8 W3C traceparent 贯穿审计链（M21）：无显式 traceId 时按头派生', async () => {
    const audit = new ComplianceAudit();
    const server = await startFamilyServer({
      serverInfo: SERVER_INFO,
      tools: TOOLS,
      manifestEntries: ENTRIES.slice(0, 1),
      admission: { allowed: ['family-core'], mode: 'observe', audit },
      pluginOfTool: () => 'rogue-pack',
    });
    const w3c = '4bf92f3577b34da6a3ce929d0e0e4736';
    call(server, 'shared__a2a_delegate', { traceparent: `00-${w3c}-00f067aa0ba902b7-01` });
    expect(server.mcp.allowlist.auditRecords).toHaveLength(1);
    expect(server.mcp.allowlist.auditRecords[0].traceId).toBe(w3c);
    await server.stop();
  });

  it('A9 外部家人 A2A 编排（M22）：a2a-delegate 工具经注入传输真实委托归一', async () => {
    let captured = null;
    const card = {
      name: '蓝图13·外部Worker',
      description: '测试注入 card',
      url: 'http://127.0.0.1:3130',
      version: '1.0.0',
      skills: [{ id: 'shared.self-judge', name: '自判', description: '' }],
    };
    const server = await startFamilyServer({
      serverInfo: SERVER_INFO,
      tools: [{ name: 'shared__a2a_delegate', description: 'A2A 委托', inputSchema: {}, logicalId: 'shared.a2a-delegate' }],
      manifestEntries: ENTRIES,
      external: {
        endpoint: 'http://127.0.0.1:3130',
        transport: {
          send: async (url, body) => {
            captured = { url, body: JSON.parse(body) };
            return JSON.stringify({ jsonrpc: '2.0', id: captured.body.id, result: { taskId: 'task-13', state: 'completed' } });
          },
        },
        card,
      },
    });
    const res = JSON.parse(
      await server.mcp.handler.handle(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'shared__a2a_delegate',
            arguments: { skillId: 'shared.self-judge', input: { q: '联调' } },
            _meta: { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
          },
        }),
      ),
    );
    expect(res.result.isError).toBe(false);
    const delegated = JSON.parse(res.result.content[0].text);
    expect(delegated.delegated).toBe(true);
    expect(delegated.task.taskId).toBe('task-13');
    expect(delegated.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736'); // traceparent 派生贯穿
    expect(captured.body.params.traceparent.startsWith('00-4bf92f3577b34da6a3ce929d0e0e4736-')).toBe(true); // W3C 头外发
    // 能力清单外技能被拒（isError，error 计账可观测）
    const denied = JSON.parse(
      await server.mcp.handler.handle(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'shared__a2a_delegate', arguments: { skillId: 'qianhang.nlq-to-api', input: {} } },
        }),
      ),
    );
    expect(denied.result.isError).toBe(true);
    expect(denied.result.content[0].text).toContain('card 能力清单外');
    expect(server.metrics.capabilityMcpToolCalls.value({ result: 'error' })).toBe(1);
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
