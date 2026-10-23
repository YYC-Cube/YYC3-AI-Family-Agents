// @ts-nocheck
/**
 * 技能执行引擎测试（skill-executor）—— P6-B（M15）· 确定性执行臂。
 *
 * 验收：
 *   E1 输入契约：缺字段 / 空值逐条报告；齐备通过；未声明 io 视为通过
 *   E2 触发核验：examples 命中词触发、无关输入不触发（与 skill-eval 同源语义）
 *   E3 步骤计划：steps 全量入 plan（order 连续、exec='llm'、llmRequired）；无步骤为空
 *   E4 输出骨架：io.output 字段 → null 骨架；无声明为空对象
 *   E5 分派集成：契约违反抛错 → isError + error 计账（error 率可观测）；合法输入回执行结果
 *   E6 端到端：startFamilyServer 缺省分派（执行引擎）→ tools/call 返回 triggered/plan/骨架
 *
 * 运行：tsc 编译 + node（零依赖 harness，范式同 family-server-assembly）。
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

import { executeManifestSkill } from '../../architecture-kernel/05-持续学习引擎/skill-consolidation/skill-executor.js';
import { assembleMcpServer } from '../../architecture-kernel/08-系统装配/mcp-server-assembly.js';
import { FamilyMetrics } from '../../architecture-kernel/09-可观测性/family-metrics.js';
import { startFamilyServer, logicalIdOfTool } from '../../family-agents/family-server.entry.js';

/** 对齐清单真实形态的条目（含 steps + io，语义取自 shared.self-judge）。 */
const ENTRY = {
  id: 'shared.self-judge',
  version: '1.0.0',
  steps: ['接收候选结论与上下文证据', '产出 0..1 置信度并显式登记假设', '检测偏离并给出升级（escalation）决策'],
  io: { input: ['candidate', 'evidence'], output: ['confidence', 'assumptions', 'escalation'] },
  examples: ['结论自评置信度登记假设'],
  tags: ['confidence', 'escalation'],
};

describe('技能执行引擎（P6-B · M15 · 确定性臂）', () => {
  it('E1 输入契约：缺字段/空值逐条报告，齐备通过，未声明 io 通过', () => {
    const missing = executeManifestSkill(ENTRY, {});
    expect(missing.inputOk).toBe(false);
    expect(missing.inputViolations).toHaveLength(2);
    expect(missing.inputViolations.join(';')).toContain('缺少输入字段：candidate');

    const blank = executeManifestSkill(ENTRY, { candidate: '  ', evidence: [] });
    expect(blank.inputOk).toBe(false);
    expect(blank.inputViolations.join(';')).toContain('输入字段为空：candidate');

    const ok = executeManifestSkill(ENTRY, { candidate: 'A→B', evidence: ['e1'] });
    expect(ok.inputOk).toBe(true);

    const noIo = executeManifestSkill({ id: 'x.plain' }, {});
    expect(noIo.inputOk).toBe(true);
  });

  it('E2 触发核验：examples 命中词触发，无关输入不触发（与 skill-eval 同源）', () => {
    const hit = executeManifestSkill(ENTRY, { candidate: '帮我做一次结论自评并登记假设', evidence: [] });
    expect(hit.triggered).toBe(true);
    const miss = executeManifestSkill(ENTRY, { candidate: '完全无关的语料', evidence: [] });
    expect(miss.triggered).toBe(false);
  });

  it('E3 步骤计划：steps 全量入 plan（order 连续 · exec=llm · llmRequired），无步骤为空', () => {
    const r = executeManifestSkill(ENTRY, { candidate: 'x', evidence: 'y' });
    expect(r.plan).toHaveLength(3);
    expect(r.plan[0].order).toBe(1);
    expect(r.plan[0].text).toContain('接收候选结论');
    expect(r.plan[2].exec).toBe('llm');
    expect(r.llmRequired).toBe(true);
    expect(r.version).toBe('1.0.0');
    expect(r.mode).toBe('deterministic');

    const bare = executeManifestSkill({ id: 'x.plain' }, {});
    expect(bare.plan).toHaveLength(0);
    expect(bare.llmRequired).toBe(false);
  });

  it('E4 输出骨架：io.output 字段 → null 骨架，无声明为空对象', () => {
    const r = executeManifestSkill(ENTRY, { candidate: 'x', evidence: 'y' });
    expect(Object.keys(r.output).join(',')).toBe('confidence,assumptions,escalation');
    expect(r.output.confidence).toBe(null);
    const bare = executeManifestSkill({ id: 'x.plain' }, {});
    expect(Object.keys(bare.output)).toHaveLength(0);
  });

  it('E5 分派集成：契约违反 → isError + error 计账；合法输入回执行结果（ok 计账）', () => {
    const metrics = new FamilyMetrics();
    const entries = new Map([[ENTRY.id, ENTRY]]);
    const dispatch = (ctx) => {
      const entry = entries.get(logicalIdOfTool(ctx.toolName));
      if (!entry) throw new Error(`未注册技能：${ctx.toolName}`);
      const result = executeManifestSkill(entry, ctx.args ?? {});
      if (!result.inputOk) throw new Error(`输入契约不满足：${result.inputViolations.join('；')}`);
      return result;
    };
    const assembly = assembleMcpServer({
      serverInfo: { name: 't', version: '1' },
      tools: [{ name: 'shared__self_judge', description: 'd', inputSchema: {}, logicalId: ENTRY.id }],
      metrics,
      dispatch,
    });
    const call = (args) =>
      JSON.parse(
        assembly.handler.handle(
          JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'shared__self_judge', arguments: args } }),
        ),
      );

    const bad = call({ candidate: '' });
    expect(bad.result.isError).toBe(true);
    expect(bad.result.content[0].text).toContain('输入契约不满足');
    expect(metrics.capabilityMcpToolCalls.value({ result: 'error' })).toBe(1);

    const good = call({ candidate: '结论自评', evidence: ['e'] });
    expect(good.result.isError).toBe(false);
    const executed = JSON.parse(good.result.content[0].text);
    expect(executed.skill).toBe('shared.self-judge');
    expect(executed.plan).toHaveLength(3);
    expect(metrics.capabilityMcpToolCalls.value({ result: 'ok' })).toBe(1);
  });

  it('E6 端到端：startFamilyServer 缺省分派（执行引擎）返回 triggered/plan/骨架', async () => {
    const server = await startFamilyServer({
      serverInfo: { name: 't', version: '1' },
      tools: [{ name: 'shared__self_judge', description: 'd', inputSchema: {}, logicalId: ENTRY.id }],
      manifestEntries: [ENTRY],
    });
    const res = JSON.parse(
      server.mcp.handler.handle(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'shared__self_judge', arguments: { candidate: '结论自评置信度', evidence: ['e'] } },
        }),
      ),
    );
    expect(res.result.isError).toBe(false);
    const executed = JSON.parse(res.result.content[0].text);
    expect(executed.triggered).toBe(true);
    expect(executed.plan).toHaveLength(3);
    expect(executed.output.escalation).toBe(null);
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
