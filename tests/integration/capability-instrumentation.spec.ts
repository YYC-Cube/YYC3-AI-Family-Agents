// @ts-nocheck
/**
 * 能力供给生产端接线测试（capability-instrumentation）—— §6.3（P5 指标接线闭环）。
 *
 * 验收：
 *   K1 技能装载接线：真实 SkillRegistry 包装后，非 planned 逐技能记账、planned 无样本
 *   K2 技能装载零侵入：Proxy 透传（get/latest 可用）；幂等重载按次数累计（口径=加载次数）
 *   K3 MCP 工具调用接线：dispatch 成功记 ok、抛错记 error（isError 语义不破）；
 *      Policy 拒绝不进入 dispatch、不计入本指标
 *   K4 准入拒绝接线：enforce 拒绝记账；observe 放行留痕不计；审计链 verify 透传仍真
 *   K5 三类互不串扰：单一 FamilyMetrics 三族指标独立累计并正确渲染
 *
 * 运行：tsc 编译 + node（零依赖 harness，范式同 collaboration-wiring）。
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
      if (!actual.includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${String(actual).slice(0, 200)}`);
    },
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`期望长度 ${n}，实际 ${actual.length}`);
    },
  });
}

import { SkillRegistry } from '../../family-agents/shared-core/memory-framework/procedural-memory/skill-registry.js';
import { createMcpRequestHandler } from '../../architecture-kernel/02-云枢核心引擎/mcp-adapter/server/protocol.js';
import { CapabilityAllowlist } from '../../architecture-kernel/10-能力注册中心/allowlist.js';
import { FamilyMetrics } from '../../architecture-kernel/09-可观测性/family-metrics.js';
import {
  instrumentSkillRegistry,
  instrumentMcpDispatcher,
  instrumentCapabilityAllowlist,
} from '../../architecture-kernel/09-可观测性/capability-instrumentation.js';

/** 内联清单条目（3 条：2 active + 1 planned；不读 presets，保持 hermetic）。 */
const ENTRIES = [
  { id: 'shared.a2a-delegate', name: 'A2A 委托', description: '外部家人任务委托', scope: 'shared' },
  { id: 'qianhang.intent-detection', name: '意图识别', description: '意图分类与路由', scope: 'dedicated', owner: '02' },
  { id: 'shared.reserved-skill', name: '预留技能', description: '未实装', scope: 'shared', status: 'planned' },
];

const callJson = (handler, name, args = {}) =>
  JSON.parse(handler.handle(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })));

describe('能力供给生产端接线（§6.3）', () => {
  it('K1 技能装载接线：非 planned 逐技能记账，planned 无样本，结果原样透出', () => {
    const metrics = new FamilyMetrics();
    const registry = instrumentSkillRegistry(new SkillRegistry(), metrics);
    const result = registry.loadFromManifest(ENTRIES);

    expect(result.loaded).toBe(2);
    expect(result.skippedPlanned).toHaveLength(1);
    expect(result.skippedPlanned[0]).toBe('shared.reserved-skill');

    expect(metrics.capabilitySkillsLoaded.value({ skill: 'shared.a2a-delegate' })).toBe(1);
    expect(metrics.capabilitySkillsLoaded.value({ skill: 'qianhang.intent-detection' })).toBe(1);
    // planned 条目跳过不记：不产生样本行（不污染默认口径）
    expect(metrics.capabilitySkillsLoaded.value({ skill: 'shared.reserved-skill' })).toBe(0);
    expect(metrics.render().includes('shared.reserved-skill')).toBe(false);
  });

  it('K2 技能装载零侵入：Proxy 透传注册表语义；幂等重载按加载次数累计', () => {
    const metrics = new FamilyMetrics();
    const registry = instrumentSkillRegistry(new SkillRegistry(), metrics);

    registry.loadFromManifest(ENTRIES);
    // Proxy 透传：装载后的定义经 get / latest 正常可达（引用语义不变）
    expect(registry.get('shared.a2a-delegate', '0.0.0').id).toBe('shared.a2a-delegate');
    expect(registry.latest('qianhang.intent-detection').status).toBe('active');
    expect(registry.list()).toHaveLength(2);

    // 幂等重载：注册表仍是 2 条（同版本覆盖），指标按「加载次数」口径累计为 2
    const again = registry.loadFromManifest(ENTRIES);
    expect(again.loaded).toBe(2);
    expect(registry.list()).toHaveLength(2);
    expect(metrics.capabilitySkillsLoaded.value({ skill: 'shared.a2a-delegate' })).toBe(2);
  });

  it('K3 MCP 工具调用接线：成功记 ok、抛错记 error 且 isError 语义不破；Policy 拒绝不计入', () => {
    const metrics = new FamilyMetrics();
    let boom = false;
    const dispatch = instrumentMcpDispatcher((ctx) => {
      if (boom) throw new Error('工具执行失败');
      return { echo: ctx.args };
    }, metrics);
    const handler = createMcpRequestHandler({
      serverInfo: { name: 'yyc3', version: '1.0.0' },
      tools: [{ name: 'echo', description: '回声', inputSchema: {} }],
      dispatch,
    });

    const okRes = callJson(handler, 'echo', { a: 1 });
    expect(okRes.result.isError).toBe(false);
    expect(okRes.result.content[0].text).toContain('echo'); // dispatch 输出原样透出

    boom = true;
    const errRes = callJson(handler, 'echo');
    expect(errRes.result.isError).toBe(true);
    expect(errRes.result.content[0].text).toContain('工具执行失败');

    expect(metrics.capabilityMcpToolCalls.value({ result: 'ok' })).toBe(1);
    expect(metrics.capabilityMcpToolCalls.value({ result: 'error' })).toBe(1);

    // Policy 拒绝：dispatch 不执行、指标不计（准入红线由 plugin_denied 承接）
    const deniedMetrics = new FamilyMetrics();
    let ran = 0;
    const counting = instrumentMcpDispatcher(() => {
      ran += 1;
      return null;
    }, deniedMetrics);
    const denied = createMcpRequestHandler({
      serverInfo: { name: 'yyc3', version: '1.0.0' },
      tools: [{ name: 'echo', description: '回声', inputSchema: {} }],
      policy: () => ({ admitted: false, reason: '未准入工具' }),
      dispatch: counting,
    });
    const deniedRes = callJson(denied, 'echo');
    expect(deniedRes.result.isError).toBe(true);
    expect(deniedRes.result.content[0].text).toContain('未准入工具');
    expect(ran).toBe(0);
    expect(deniedMetrics.capabilityMcpToolCalls.value({ result: 'ok' })).toBe(0);
    expect(deniedMetrics.capabilityMcpToolCalls.value({ result: 'error' })).toBe(0);
  });

  it('K4 准入拒绝接线：enforce 拒绝记账；observe 放行不计；审计链透传仍可校验', () => {
    const metrics = new FamilyMetrics();
    const allowlist = instrumentCapabilityAllowlist(
      new CapabilityAllowlist({ allowed: ['family-core'], mode: 'enforce' }),
      metrics,
    );

    const denied = allowlist.admit({ pluginId: 'unknown-pack', traceId: 't-denied', actor: 'tester' });
    expect(denied.admitted).toBe(false);
    expect(allowlist.rejectedCount).toBe(1);
    expect(metrics.capabilityPluginDenied.value({ plugin: 'unknown-pack' })).toBe(1);

    // 已准入调用放行：不计入拒绝指标
    const admitted = allowlist.admit({ pluginId: 'family-core', traceId: 't-ok', actor: 'tester' });
    expect(admitted.admitted).toBe(true);
    expect(metrics.capabilityPluginDenied.value({ plugin: 'family-core' })).toBe(0);

    // observe 模式：未准入放行留痕（admitted=true），不是 enforce 拒绝、不计
    const observe = instrumentCapabilityAllowlist(new CapabilityAllowlist({ allowed: [] }), metrics);
    const observed = observe.admit({ pluginId: 'gray-pack', traceId: 't-obs', actor: 'tester' });
    expect(observed.admitted).toBe(true);
    expect(observed.audited).toBe(true);
    expect(metrics.capabilityPluginDenied.value({ plugin: 'gray-pack' })).toBe(0);

    // Proxy 透传：审计链防篡改校验语义零改动
    expect(allowlist.verifyAudit()).toBe(true);
  });

  it('K5 三类互不串扰：单一 FamilyMetrics 三族指标独立累计并正确渲染', () => {
    const metrics = new FamilyMetrics();
    const registry = instrumentSkillRegistry(new SkillRegistry(), metrics);
    const allowlist = instrumentCapabilityAllowlist(
      new CapabilityAllowlist({ allowed: [], mode: 'enforce' }),
      metrics,
    );
    const dispatch = instrumentMcpDispatcher(() => ({ ok: true }), metrics);
    const handler = createMcpRequestHandler({
      serverInfo: { name: 'yyc3', version: '1.0.0' },
      tools: [{ name: 'echo', description: '回声', inputSchema: {} }],
      dispatch,
    });

    registry.loadFromManifest(ENTRIES.slice(0, 1)); // 1 次装载
    callJson(handler, 'echo'); // 1 次 ok
    callJson(handler, 'echo'); // 2 次 ok
    allowlist.admit({ pluginId: 'rogue-pack', traceId: 't', actor: 'tester' }); // 1 次拒绝

    const text = metrics.render();
    expect(text).toContain('family_capability_skills_loaded_total{skill="shared.a2a-delegate"} 1');
    expect(text).toContain('family_capability_mcp_tool_calls_total{result="ok"} 2');
    expect(text).toContain('family_capability_plugin_denied_total{plugin="rogue-pack"} 1');
    expect(metrics.capabilityMcpToolCalls.value({ result: 'error' })).toBe(0);
    expect(metrics.capabilityPluginDenied.value({ plugin: 'family-core' })).toBe(0);
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
