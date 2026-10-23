// @ts-nocheck
/**
 * Phase A 单元测试 —— 程序记忆条目提取核心逻辑（prompt-rule-extractor）。
 *
 * 覆盖目标（对应《架构设计.md》§6.4 Phase A 验收）：
 *   1. 行为/禁止/工具规则分类与规范化
 *   2. 有序步骤 → 工作流聚合（含单步不成流）
 *   3. 幂等性（同输入 → 同 ID，可回归对比）
 *   4. 去重与显著度排序（禁止 > 行为 > 工具）
 *   5. 溯源（source+line）与忽略行审计
 *   6. 提取 → 注册（ProceduralStore）→ 检索 的 Phase A 闭环
 *
 * 运行方式：
 *   - 未来接入 vitest（`pnpm test`）；
 *   - 当前零依赖：底部 harness 在纯 node 下自动执行全部用例并汇总结果。
 */

// ---- 测试垫片（vitest 存在则复用，否则本地实现）----
const __localShim = typeof describe === 'undefined';
if (__localShim) {
  globalThis.__suite = { current: null, cases: [], passed: 0, failed: 0 };
  globalThis.describe = (name, fn) => {
    globalThis.__suite.current = name;
    fn();
    globalThis.__suite.current = null;
  };
  globalThis.it = (name, fn) => {
    const caseName = `${globalThis.__suite.current ?? ''} > ${name}`;
    try {
      fn();
      globalThis.__suite.passed += 1;
      globalThis.__suite.cases.push(`PASS  ${caseName}`);
    } catch (e) {
      globalThis.__suite.failed += 1;
      globalThis.__suite.cases.push(`FAIL  ${caseName}\n      ${e && e.message}`);
    }
  };
  globalThis.expect = (actual) => ({
    toBe: (exp) => {
      if (actual !== exp) throw new Error(`期望 ${JSON.stringify(exp)}，实际 ${JSON.stringify(actual)}`);
    },
    toEqual: (exp) => {
      const ja = JSON.stringify(actual);
      const je = JSON.stringify(exp);
      if (ja !== je) throw new Error(`期望 ${je}，实际 ${ja}`);
    },
    toBeGreaterThan: (exp) => {
      if (!(actual > exp)) throw new Error(`期望 > ${exp}，实际 ${actual}`);
    },
    toBeLessThan: (exp) => {
      if (!(actual < exp)) throw new Error(`期望 < ${exp}，实际 ${actual}`);
    },
    toBeGreaterThanOrEqual: (exp) => {
      if (!(actual >= exp)) throw new Error(`期望 >= ${exp}，实际 ${actual}`);
    },
    toBeUndefined: () => {
      if (actual !== undefined) throw new Error(`期望 undefined，实际 ${JSON.stringify(actual)}`);
    },
    toContain: (exp) => {
      if (!actual.includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${JSON.stringify(actual)}`);
    },
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`期望长度 ${n}，实际 ${actual.length}`);
    },
  });
}

import { ProceduralStore } from '../../family-agents/shared-core/memory-framework/procedural-memory/index.js';
import {
  compareSemver,
  extractRules,
  normalizeStatement,
  salienceOf,
  stableHash,
  toSkillDrafts,
} from '../../family-agents/shared-core/memory-framework/procedural-memory/prompt-rule-extractor.js';

// ---- 测试语料 ----
const PROMPT = [
  '# 言启·千行 系统提示词', //          L1  标题 → 忽略
  '', //                                L2  空行 → 忽略
  '- **必须**先澄清用户意图，再进行路由。', // L3 behavior
  '2. 调用意图工具解析领域词。', //      L4  tool-usage（有序行 → 工作流起始）
  '3. 将解析结果写入上下文。', //        L5  工作流第 2 步
  '这是一段普通叙述，没有规则特征。', //  L6  普通行 → 忽略
  '禁止在低置信度下直接输出结论。', //    L7  constraint
  '- 必须先澄清用户意图，再进行路由。', // L8  与 L3 同陈述 → 去重
  '7. 孤立的有序行不成工作流。', //      L9  单步 → 忽略计数
  '应当始终记录 traceId。', //           L10 behavior
  '- 调用检索工具查询用户画像。', //      L11 tool-usage（无序 bullet 含工具）
  '以上为导航员行为准则。', //           L12 普通行 → 忽略
].join('\n');

describe('Phase A · 记忆条目提取（prompt-rule-extractor）', () => {
  it('T1 规范化：去列表标记/着重号/多余空白', () => {
    expect(normalizeStatement('- **必须**先澄清用户意图，再进行路由。')).toBe(
      '必须先澄清用户意图，再进行路由。',
    );
    expect(normalizeStatement('  1.  调用   工具  ')).toBe('调用 工具');
  });

  it('T2 稳定哈希：同输入 → 同 ID（幂等性基础）', () => {
    expect(stableHash('abc')).toBe(stableHash('abc'));
    expect(typeof stableHash('abc')).toBe('string');
  });

  it('T3 显著度映射：constraint > behavior > tool-usage', () => {
    expect(salienceOf('constraint')).toBe(0.9);
    expect(salienceOf('behavior')).toBe(0.7);
    expect(salienceOf('tool-usage')).toBe(0.5);
    expect(salienceOf('constraint')).toBeGreaterThan(salienceOf('behavior'));
    expect(salienceOf('behavior')).toBeGreaterThan(salienceOf('tool-usage'));
  });

  it('T4 分类提取：行为/禁止/工具三类均被识别', () => {
    const r = extractRules(PROMPT, { source: 'qianhang/system-prompt.md' });
    const kinds = Object.fromEntries(r.entries.map((e) => [e.kind, true]));
    expect(kinds.behavior).toBe(true);
    expect(kinds.constraint).toBe(true);
    expect(kinds['tool-usage']).toBe(true);
  });

  it('T5 陈述规范化与原文保留（审计对照）', () => {
    const r = extractRules(PROMPT);
    const behavior = r.entries.find((e) => e.statement.includes('先澄清用户意图'));
    expect(behavior.statement).toBe('必须先澄清用户意图，再进行路由。');
    expect(behavior.raw).toBe('- **必须**先澄清用户意图，再进行路由。');
  });

  it('T6 溯源：source 与行号精确（L3→3，L7→7）', () => {
    const r = extractRules(PROMPT, { source: 'qianhang/system-prompt.md' });
    const behavior = r.entries.find((e) => e.kind === 'behavior' && e.provenance.line === 3);
    const constraint = r.entries.find((e) => e.kind === 'constraint');
    expect(behavior.provenance.source).toBe('qianhang/system-prompt.md');
    expect(behavior.provenance.line).toBe(3);
    expect(constraint.provenance.line).toBe(7);
  });

  it('T7 去重：同陈述（L3 与 L8）仅保留首条', () => {
    const r = extractRules(PROMPT);
    const same = r.entries.filter((e) => e.statement.includes('先澄清用户意图'));
    expect(same).toHaveLength(1);
  });

  it('T8 工作流聚合：连续有序行 → 单一工作流，order 重排 1..n', () => {
    const r = extractRules(PROMPT);
    expect(r.workflows).toHaveLength(1);
    const wf = r.workflows[0];
    expect(wf.steps).toHaveLength(2);
    expect(wf.steps[0].order).toBe(1);
    expect(wf.steps[1].order).toBe(2);
    expect(wf.provenance.line).toBe(4); // 工作流起始于 L4
  });

  it('T9 单步不成流：孤立有序行计入忽略，不产出工作流', () => {
    const r = extractRules('1. 只有一步\n');
    expect(r.workflows).toHaveLength(0);
    expect(r.ignoredLines).toBeGreaterThanOrEqual(1);
  });

  it('T10 忽略行审计：标题/空行/普通行被计数', () => {
    const r = extractRules(PROMPT);
    // L1 标题 + L2 空行(不计) + L6 普通行 + L9 单步 = 至少 3
    expect(r.ignoredLines).toBeGreaterThanOrEqual(3);
  });

  it('T11 幂等回归：两次提取结果完全一致（可 A/B 对比）', () => {
    const a = extractRules(PROMPT);
    const b = extractRules(PROMPT);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('T12 边界：空输入与无规则文本', () => {
    const empty = extractRules('');
    expect(empty.entries).toHaveLength(0);
    expect(empty.workflows).toHaveLength(0);
    const plain = extractRules('今天天气不错。');
    expect(plain.entries).toHaveLength(0);
    expect(plain.ignoredLines).toBe(1);
  });

  it('T13 Phase A 闭环：提取 → 注册 ProceduralStore → 检索命中', () => {
    const r = extractRules(PROMPT);
    const store = new ProceduralStore();
    for (const w of toSkillDrafts(r)) {
      store.skills.register({ ...w, description: w.description, when: w.when, steps: w.steps });
    }
    for (const e of r.entries.filter((x) => x.kind === 'constraint')) {
      store.guardrails.register({ id: e.id, statement: e.statement, action: 'deny', version: '1.0.0', interceptPoint: 'policy-bus', scope: 'agent', status: 'active' });
    }
    const hits = store.retrieve({ text: '解析', limit: 10 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].layer).toBe('procedural');
  });

  it('T14 compareSemver：版本比较语义正确（回滚依赖）', () => {
    expect(compareSemver('1.2.0', '1.1.9')).toBeGreaterThan(0);
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('0.9.0', '1.0.0')).toBeLessThan(0);
  });

  it('T15 禁止类条目可作为护栏来源（G1→治 协同）', () => {
    const r = extractRules(PROMPT);
    const constraints = r.entries.filter((e) => e.kind === 'constraint');
    expect(constraints).toHaveLength(1);
    expect(constraints[0].statement).toContain('禁止');
    expect(constraints[0].salience).toBe(0.9);
  });
});

// ---- 纯 node 自动执行 harness（vitest 环境下不生效）----
if (__localShim) {
  const s = globalThis.__suite;
  for (const line of s.cases) console.log(line);
  console.log(`\n结果：${s.passed} 通过 / ${s.failed} 失败 / 共 ${s.passed + s.failed} 例`);
  if (s.failed > 0) process.exit(1);
}
