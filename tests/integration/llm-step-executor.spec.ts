// @ts-nocheck
/**
 * LLM 技能步骤执行器测试（llm-step-executor）—— P6-C（M16）· 语义执行臂。
 *
 * 验收：
 *   G1 逐步执行：runner 按序收到步骤提示词（含技能 id 与步骤文本），产物逐条累积
 *   G2 JSON 抽取：围栏剥离 + 首对象抽取；无法解析回退 {raw}
 *   G3 输出填充：末步产物填充 io.output；未覆盖字段留 null + violations
 *   G4 契约先行：输入契约违反直接抛错（runner 不被调用）
 *   G5 runner 异常透传（分派层转 isError 可观测）
 *   G6 端到端异步：startFamilyServer 注入假 runner → tools/call 返回 Promise →
 *      输出骨架已填充；无步骤条目仍走同步快速路径
 *
 * 运行：tsc 编译 + node（零依赖 harness，范式同 skill-executor；假件注入，零网络）。
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

import {
  executeSkillWithLlm,
  extractStepJson,
  createLlmStepRunner,
} from '../../family-agents/shared-core/llm-adapter/skill-step-executor.js';
import { startFamilyServer } from '../../family-agents/family-server.entry.js';
import { FamilyMetrics } from '../../architecture-kernel/09-可观测性/family-metrics.js';

const ENTRY = {
  id: 'shared.self-judge',
  version: '1.0.0',
  steps: ['接收候选结论与上下文证据', '产出 0..1 置信度并显式登记假设', '检测偏离并给出升级决策'],
  io: { input: ['candidate', 'evidence'], output: ['confidence', 'assumptions', 'escalation'] },
  examples: ['结论自评置信度登记假设'],
};

describe('LLM 技能步骤执行器（P6-C · M16 · 语义臂）', () => {
  it('G1 逐步执行：runner 按序收到步骤提示词，产物逐条累积', async () => {
    const calls = [];
    const runner = async (messages, step) => {
      calls.push({ system: messages[0].content, user: messages[1].content, order: step.order });
      return JSON.stringify({ step: step.order, seenArtifacts: calls.length });
    };
    const r = await executeSkillWithLlm(ENTRY, { candidate: 'A→B', evidence: ['e1'] }, { runner });
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.order).join(',')).toBe('1,2,3');
    expect(calls[0].system).toContain('shared.self-judge');
    expect(calls[0].system).toContain('接收候选结论与上下文证据');
    expect(calls[2].user).toContain('已完成步骤产物'); // 累积上下文
    expect(r.mode).toBe('llm-assisted');
    expect(r.plan.every((p) => p.status === 'done')).toBeTruthy();
  });

  it('G2 JSON 抽取：围栏剥离 + 首对象抽取；无法解析回退 raw', () => {
    expect(extractStepJson('```json\n{"confidence": 0.8}\n```').confidence).toBe(0.8);
    expect(extractStepJson('前置说明 {"a":1} 尾部').a).toBe(1);
    expect(extractStepJson('完全不是 JSON').raw).toBeTruthy();
  });

  it('G3 输出填充：末步产物填充 io.output，未覆盖字段留 null + violations', async () => {
    const runner = async (_m, step) =>
      step.order === 3 ? '```json\n{"confidence": 0.75, "assumptions": ["假设一"]}\n```' : '{"mid": true}';
    const r = await executeSkillWithLlm(ENTRY, { candidate: 'x', evidence: 'y' }, { runner });
    expect(r.output.confidence).toBe(0.75);
    expect(r.output.assumptions).toHaveLength(1);
    expect(r.output.escalation).toBe(null);
    expect(r.outputViolations.join(';')).toContain('输出字段未填充：escalation');
  });

  it('G4 契约先行：输入契约违反直接抛错，runner 不被调用', async () => {
    let called = 0;
    const runner = async () => {
      called += 1;
      return '{}';
    };
    let thrown = '';
    try {
      await executeSkillWithLlm(ENTRY, {}, { runner });
    } catch (e) {
      thrown = e.message;
    }
    expect(thrown).toContain('输入契约不满足');
    expect(called).toBe(0);
  });

  it('G5 runner 异常透传（分派层转 isError 可观测）', async () => {
    const runner = async () => {
      throw new Error('provider 超时');
    };
    let thrown = '';
    try {
      await executeSkillWithLlm(ENTRY, { candidate: 'x', evidence: 'y' }, { runner });
    } catch (e) {
      thrown = e.message;
    }
    expect(thrown).toContain('provider 超时');
  });

  it('G8 观测注入（M19）：metrics 传入即上报步骤数与填充率', async () => {
    const metrics = new FamilyMetrics();
    const runner = async (_m, step) =>
      step.order === 3 ? '{"confidence": 0.8, "assumptions": []}' : '{"mid": 1}';
    const r = await executeSkillWithLlm(ENTRY, { candidate: 'x', evidence: 'y' }, { runner, metrics });
    expect(r.mode).toBe('llm-assisted');
    expect(metrics.llmSteps.value({ skill: 'shared.self-judge' })).toBe(3);
    const text = metrics.render();
    expect(text).toContain('family_llm_steps_total{skill="shared.self-judge"} 3');
    expect(text).toContain('family_llm_output_fill_ratio 0.6666666666666666');
  });

  it('G6 端到端异步：注入假 runner 经协议层 await，输出已填充；无步骤条目走同步路径', async () => {
    const server = await startFamilyServer({
      serverInfo: { name: 't', version: '1' },
      tools: [
        { name: 'shared__self_judge', description: 'd', inputSchema: {}, logicalId: ENTRY.id },
        { name: 'x__plain', description: 'd', inputSchema: {}, logicalId: 'x.plain' },
      ],
      manifestEntries: [ENTRY, { id: 'x.plain', name: '纯契约', description: '无步骤', scope: 'shared', version: '1.0.0' }],
      llmRunner: async (_m, step) =>
        step.order === 3 ? '{"confidence": 0.9, "assumptions": [], "escalation": "none"}' : '{"mid": 1}',
    });
    const handle = (name, args) =>
      server.mcp.handler.handle(
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      );

    const asyncRes = JSON.parse(await handle('shared__self_judge', { candidate: '结论自评', evidence: ['e'] }));
    expect(asyncRes.result.isError).toBe(false);
    const executed = JSON.parse(asyncRes.result.content[0].text);
    expect(executed.mode).toBe('llm-assisted');
    expect(executed.output.confidence).toBe(0.9);
    expect(executed.output.escalation).toBe('none');

    // 无步骤条目：同步快速路径（handle 直接返回字符串，非 Promise）
    const syncOut = handle('x__plain', {});
    expect(typeof syncOut).toBe('string');
    const syncRes = JSON.parse(syncOut);
    expect(syncRes.result.isError).toBe(false);
    expect(JSON.parse(syncRes.result.content[0].text).mode).toBe('deterministic');
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
