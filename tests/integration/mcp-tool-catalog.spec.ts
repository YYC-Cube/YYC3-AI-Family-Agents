// @ts-nocheck
/**
 * MCP 工具目录测试（mcp-tool-catalog）—— P4-T5。
 * 门禁映射：manifest 技能 → tools/list 目录；工具名符合 MCP 命名；
 *   tools/call 经 Policy 后分派；未准入工具不可见（列表与调用同源过滤）；
 *   与 P4-T3 准入治理协同（observe 留痕 / enforce 拒绝）。
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  MCP_PROTOCOL_VERSION,
  createMcpRequestHandler,
} from '../../architecture-kernel/02-云枢核心引擎/mcp-adapter/server/protocol.js';
import { CapabilityAllowlist } from '../../architecture-kernel/10-能力注册中心/index.js';

const ROOT = process.cwd();
const ARTIFACT = JSON.parse(readFileSync(path.join(ROOT, 'assets/mcp-tools.json'), 'utf8'));
const TOOLS = ARTIFACT.tools;

/** 金包 skills refs（与 P4-T1 资产同源，正则抽取）。 */
function goldenSkillRefs() {
  const yaml = readFileSync(path.join(ROOT, 'plugins/family-core/plugin.yaml'), 'utf8');
  const section = yaml.slice(yaml.indexOf('type: skills'), yaml.indexOf('type: mcp-servers'));
  return [...section.matchAll(/- ([a-z0-9]+\.[a-z0-9-]+)\n/g)].map((m) => m[1]);
}

const GOLDEN_REFS = goldenSkillRefs();

/** 工具 → 归属能力包（演示部署侧映射：金包技能归 family-core，其余未归属）。 */
const PLUGIN_OF = new Map(TOOLS.map((t) => [t.name, GOLDEN_REFS.includes(t.logicalId) ? 'family-core' : 'unowned']));

function handler(extra = {}) {
  return createMcpRequestHandler({
    serverInfo: { name: 'yyc3-family-agent', version: '2.23.0' },
    tools: TOOLS,
    dispatch: (ctx) => ({ ok: true, tool: ctx.toolName, args: ctx.args }),
    ...extra,
  });
}

function request(h, payload) {
  const raw = h.handle(JSON.stringify(payload));
  return raw === null ? null : JSON.parse(raw);
}

const toolsCall = (h, name, args, meta) =>
  request(h, { jsonrpc: '2.0', id: 'call-1', method: 'tools/call', params: { name, arguments: args, _meta: meta } });

const textOf = (res) => res.result.content[0].text;

/** 用 P4-T3 准入清单构造 tools/call 策略（工具 → 归属包 → allowlist.admit）。 */
function allowlistPolicy(allowlist) {
  return (ctx) => {
    const decision = allowlist.admit({
      pluginId: PLUGIN_OF.get(ctx.toolName) ?? 'unowned',
      traceId: ctx.traceId ?? 'trace',
      actor: ctx.actor ?? 'qianxing',
    });
    return { admitted: decision.admitted, reason: decision.reason };
  };
}

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
    toBeTruthy: () => {
      if (!actual) throw new Error(`期望真值，实际 ${JSON.stringify(actual)}`);
    },
    toBeFalsy: () => {
      if (actual) throw new Error(`期望假值，实际 ${JSON.stringify(actual)}`);
    },
    toThrow: (fragment) => {
      let threw = null;
      try {
        actual();
      } catch (e) {
        threw = e;
      }
      if (!threw) throw new Error('期望抛错，但未抛');
      if (fragment && !String(threw.message).includes(fragment)) throw new Error(`错误消息缺「${fragment}」：${threw.message}`);
    },
  });
}

describe('MCP 工具目录（P4-T5）', () => {
  it('manifest 目录 → tools/list：45 工具 · 协议版本一致 · 仅暴露 MCP 三字段', () => {
    globalThis.expect(ARTIFACT.count).toBe(45);
    globalThis.expect(ARTIFACT.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    const res = request(handler(), { jsonrpc: '2.0', id: 'list-1', method: 'tools/list' });
    globalThis.expect(res.id).toBe('list-1');
    globalThis.expect(res.result.tools.length).toBe(45);
    globalThis.expect(res.result.tools[0].name).toBe(ARTIFACT.tools[0].name);
    // 资产内的 logicalId/title 不外泄到协议层
    globalThis.expect(Object.keys(res.result.tools[0]).sort().join(',')).toBe('description,inputSchema,name');
    for (const tool of res.result.tools) {
      if (!/^[a-zA-Z0-9_-]+$/.test(tool.name)) throw new Error(`工具名不合规：${tool.name}`);
    }
  });

  it('未准入工具不可见：列表隐藏且调用一律 -32602（不泄露存在性）', () => {
    const allowlist = new CapabilityAllowlist({ allowed: ['family-core'] });
    const h = handler({ visible: (tool) => allowlist.isAllowed(PLUGIN_OF.get(tool.name) ?? 'unowned') });
    const list = request(h, { jsonrpc: '2.0', id: 'list-2', method: 'tools/list' });
    // P2 激活后金包 13 条技能全部进工具目录（shared.a2a-delegate 已 active）→ 可见 13
    const admittedRefs = GOLDEN_REFS.filter((id) => TOOLS.some((t) => t.logicalId === id));
    globalThis.expect(admittedRefs.length).toBe(13);
    globalThis.expect(list.result.tools.length).toBe(admittedRefs.length);
    for (const tool of list.result.tools) {
      if (!GOLDEN_REFS.includes(ARTIFACT.tools.find((t) => t.name === tool.name).logicalId)) {
        throw new Error(`未准入工具出现在列表：${tool.name}`);
      }
    }
    const hiddenName = 'qianhang__intent_detection';
    if (list.result.tools.some((t) => t.name === hiddenName)) throw new Error(`未准入工具泄漏：${hiddenName}`);
    const denied = toolsCall(h, hiddenName, {});
    globalThis.expect(denied.error.code).toBe(-32602);
    if (String(denied.error.message).includes('Policy')) throw new Error('隐藏工具不应走 Policy 路径（信息泄露）');
  });

  it('tools/call 成功：Policy 放行后分派，结果 JSON 化且 id 关联', () => {
    const h = handler();
    const res = toolsCall(h, 'shared__self_judge', { USER_TEXT: '帮我评估' }, { traceId: 't-1', actor: 'qianxing' });
    globalThis.expect(res.id).toBe('call-1');
    globalThis.expect(res.result.isError).toBe(false);
    const payload = JSON.parse(textOf(res));
    globalThis.expect(payload.tool).toBe('shared__self_judge');
    globalThis.expect(payload.args.USER_TEXT).toBe('帮我评估');
  });

  it('Policy 拒绝：不进入分派，返回 isError 结果并带原因', () => {
    let calls = 0;
    const h = handler({
      policy: () => ({ admitted: false, reason: '策略拒绝：未授权工具' }),
      dispatch: () => {
        calls += 1;
        return { ok: true };
      },
    });
    const res = toolsCall(h, 'shared__self_judge', {});
    globalThis.expect(res.result.isError).toBe(true);
    globalThis.expect(textOf(res)).toBe('策略拒绝：未授权工具');
    globalThis.expect(calls).toBe(0);
  });

  it('参数与分派边界：缺 name / arguments 非对象 / 未知工具 -32602；无 dispatch -32603；通知静默', () => {
    const h = handler();
    globalThis.expect(request(h, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} }).error.code).toBe(-32602);
    globalThis.expect(
      request(h, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'shared__self_judge', arguments: 'x' } }).error.code,
    ).toBe(-32602);
    globalThis.expect(toolsCall(h, 'no__such_tool', {}).error.code).toBe(-32602);
    const noDispatch = handler({ dispatch: undefined });
    globalThis.expect(toolsCall(noDispatch, 'shared__self_judge', {}).error.code).toBe(-32603);
    globalThis.expect(h.handle(JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'shared__self_judge' } }))).toBe(null);
    globalThis.expect(() =>
      createMcpRequestHandler({ serverInfo: { name: 'x', version: '1.0.0' }, tools: [{ name: 'bad name', description: '', inputSchema: {} }] }),
    ).toThrow('工具名不合规');
  });

  it('分派异常：按 MCP 语义返回 isError（协议层不炸，后续请求可用）', () => {
    const h = handler({
      dispatch: () => {
        throw new Error('工具执行失败：上游超时');
      },
    });
    const res = toolsCall(h, 'shared__self_judge', {});
    globalThis.expect(res.result.isError).toBe(true);
    globalThis.expect(textOf(res)).toBe('工具执行失败：上游超时');
    const ping = request(h, { jsonrpc: '2.0', id: 'p', method: 'ping' });
    globalThis.expect(JSON.stringify(ping.result)).toBe('{}');
  });

  it('与 P4-T3 协同（observe）：未准入包工具放行但写 ComplianceAudit', () => {
    const allowlist = new CapabilityAllowlist({ allowed: ['family-core'] });
    const h = handler({ policy: allowlistPolicy(allowlist) });

    const admitted = toolsCall(h, 'shared__self_judge', {});
    globalThis.expect(admitted.result.isError).toBe(false);
    globalThis.expect(allowlist.auditRecords.length).toBe(0);

    const observed = toolsCall(h, 'qianhang__intent_detection', {});
    globalThis.expect(observed.result.isError).toBe(false);
    globalThis.expect(allowlist.observedCount).toBe(1);
    globalThis.expect(allowlist.auditRecords.length).toBe(1);
    globalThis.expect(allowlist.auditRecords[0].decision.decision).toBe('allow-with-audit');
    globalThis.expect(allowlist.verifyAudit()).toBe(true);
  });

  it('与 P4-T3 协同（enforce）：未准入包工具拒绝并计数', () => {
    const allowlist = new CapabilityAllowlist({ allowed: ['family-core'], mode: 'enforce' });
    const h = handler({ policy: allowlistPolicy(allowlist) });

    const denied = toolsCall(h, 'qianhang__intent_detection', {});
    globalThis.expect(denied.result.isError).toBe(true);
    if (!String(textOf(denied)).includes('enforce 拒绝')) throw new Error(`拒绝原因缺失：${textOf(denied)}`);
    globalThis.expect(allowlist.rejectedCount).toBe(1);
    globalThis.expect(allowlist.auditRecords[0].decision.decision).toBe('deny');

    const stillOk = toolsCall(h, 'shared__self_judge', {});
    globalThis.expect(stillOk.result.isError).toBe(false);
    globalThis.expect(allowlist.rejectedCount).toBe(1);
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
