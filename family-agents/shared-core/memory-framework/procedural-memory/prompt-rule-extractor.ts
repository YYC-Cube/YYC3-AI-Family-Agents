/**
 * Prompt 规则提取器（prompt-rule-extractor）——「知」支柱 Phase A 核心。
 *
 * 依据《架构设计.md》§6.4 Phase A：把 system-prompt / prompt 中的
 * 工具使用模式、工作流约束、行为规则，**确定性**提取为可版本化的
 * 程序记忆条目（无 LLM 依赖，纯规则启发式，保证可审计、可复现、可回归）。
 *
 * 提取启发式（中文语料优先）：
 *   - 行为规则（behavior）：含 必须/应当/始终/永远/must/always/shall
 *   - 禁止约束（constraint）：含 禁止/不得/切勿/never/forbidden
 *   - 工具用法（tool-usage）：含 工具/tool/调用 且具备动宾结构标记
 *   - 工作流（workflow）：有序列表（1. 2. 3. / 一、二、）聚合为 WorkflowPattern
 *
 * 不负责：语义级抽象（LLM 提炼，归 05-持续学习引擎 pattern-extractor）；
 *         注册落盘（调用方写入 SkillRegistry / GuardrailRegistry）。
 */

import { compareSemver } from './skill-registry.js';
import type { WorkflowPattern } from './workflow-patterns.js';

/** 提取出的记忆条目种类。 */
export type RuleKind = 'behavior' | 'constraint' | 'tool-usage' | 'workflow';

/** 程序记忆条目草案（提取产物，待注册/审核）。 */
export interface RuleEntry {
  /** 稳定 ID：kind + 内容摘要哈希（同输入 → 同 ID，保证幂等）。 */
  readonly id: string;
  readonly kind: RuleKind;
  /** 规范化后的规则陈述（去除列表标记与多余空白）。 */
  readonly statement: string;
  /** 显著度（0–1）：禁止类 > 行为类 > 工具类；用于 write-policy 优先级。 */
  readonly salience: number;
  /** 溯源：来源文件与原文行号（审计必需）。 */
  readonly provenance: { readonly source: string; readonly line: number };
  /** 原文（未改动作审计对照）。 */
  readonly raw: string;
}

/** 工作流草案（有序步骤聚合）。 */
export interface WorkflowDraft {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly steps: readonly { readonly order: number; readonly action: string }[];
  readonly provenance: { readonly source: string; readonly line: number };
}

/** 提取结果。 */
export interface ExtractionResult {
  readonly entries: readonly RuleEntry[];
  readonly workflows: readonly WorkflowDraft[];
  /** 被忽略的行数（无规则特征），供审计与调参。 */
  readonly ignoredLines: number;
}

/** 提取选项。 */
export interface ExtractOptions {
  /** 来源文件名（写入 provenance，默认 'system-prompt.md'）。 */
  readonly source?: string;
  /** 版本（工作流草案默认 '1.0.0'）。 */
  readonly version?: string;
}

const BEHAVIOR_KEYWORDS = ['必须', '应当', '始终', '永远', '务必', 'must', 'always', 'shall'];
const CONSTRAINT_KEYWORDS = ['禁止', '不得', '切勿', '严禁', 'never', 'forbidden', '不得'];
const TOOL_KEYWORDS = ['工具', 'tool', '调用', 'invoke', 'api'];

/** 稳定摘要哈希（FNV-1a 32bit，同输入 → 同 ID）。 */
export function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 规范化陈述：去列表标记/着重号/前导残留星号/多余空白。 */
export function normalizeStatement(raw: string): string {
  return raw
    .replace(/^\s*(?:[-*·]|\d+[.、)]|[一二三四五六七八九十]+、)\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/^\*+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(text: string, keywords: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

/** 条目显著度：constraint 0.9 > behavior 0.7 > tool-usage 0.5。 */
export function salienceOf(kind: RuleKind): number {
  switch (kind) {
    case 'constraint':
      return 0.9;
    case 'behavior':
      return 0.7;
    case 'tool-usage':
      return 0.5;
    default:
      return 0.4;
  }
}

function classify(line: string): RuleKind | undefined {
  if (hasAny(line, CONSTRAINT_KEYWORDS)) return 'constraint';
  if (hasAny(line, BEHAVIOR_KEYWORDS)) return 'behavior';
  if (hasAny(line, TOOL_KEYWORDS) && /^\s*[-*\d]/.test(line)) return 'tool-usage';
  return undefined;
}

/**
 * 从 prompt markdown 文本确定性提取程序记忆条目。
 * 同一输入永远得到同一输出（幂等），便于回归对比与 A/B。
 */
export function extractRules(promptText: string, options: ExtractOptions = {}): ExtractionResult {
  const source = options.source ?? 'system-prompt.md';
  const version = options.version ?? '1.0.0';
  const lines = promptText.split(/\r?\n/);

  const entries: RuleEntry[] = [];
  const workflows: WorkflowDraft[] = [];
  let ignoredLines = 0;

  // 工作流聚合状态机：连续有序行 → 同一 WorkflowDraft
  let wfSteps: { order: number; action: string; line: number }[] = [];
  let wfStartLine = 0;

  const flushWorkflow = (): void => {
    if (wfSteps.length >= 2) {
      const name = wfSteps[0]!.action.slice(0, 24);
      const id = `wf-${stableHash(wfSteps.map((s) => s.action).join('|'))}`;
      workflows.push({
        id,
        name,
        version,
        steps: wfSteps.map((s, i) => ({ order: i + 1, action: s.action })),
        provenance: { source, line: wfStartLine },
      });
    } else if (wfSteps.length === 1) {
      ignoredLines += 1; // 单步不成流
    }
    wfSteps = [];
  };

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const line = rawLine.trimEnd();

    // 有序列表行 → 工作流候选
    const ordered = line.match(/^\s*(\d+)[.、)]\s+(.+)$/);
    if (ordered) {
      if (wfSteps.length === 0) wfStartLine = lineNo;
      wfSteps.push({ order: Number(ordered[1]), action: normalizeStatement(ordered[2]!), line: lineNo });
      return;
    }
    flushWorkflow();

    // 空行/标题行忽略
    if (!line.trim() || /^#{1,6}\s/.test(line.trim())) {
      if (line.trim()) ignoredLines += 1;
      return;
    }

    const kind = classify(line);
    if (!kind) {
      ignoredLines += 1;
      return;
    }
    const statement = normalizeStatement(line);
    if (!statement) {
      ignoredLines += 1;
      return;
    }
    entries.push({
      id: `${kind}-${stableHash(statement)}`,
      kind,
      statement,
      salience: salienceOf(kind),
      provenance: { source, line: lineNo },
      raw: line.trim(),
    });
  });
  flushWorkflow();

  // 同陈述去重（保留首现，合并溯源取首条）
  const seen = new Set<string>();
  const deduped = entries.filter((e) => {
    const key = `${e.kind}:${e.statement}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { entries: deduped, workflows, ignoredLines };
}

/**
 * 语义化版本工具（复用 skill-registry），供调用方做版本对齐校验。
 */
export { compareSemver };

/** 将提取结果装配为可写入 SkillRegistry 的技能定义草案集合。 */
export function toSkillDrafts(
  result: ExtractionResult,
): readonly { id: string; name: string; version: string; description: string; when: readonly string[]; steps: readonly { order: number; action: string }[]; status: 'active' }[] {
  return result.workflows.map((w) => ({
    id: w.id,
    name: w.name,
    version: w.version,
    description: `提取自 ${w.provenance.source}:${w.provenance.line}`,
    when: [],
    steps: w.steps,
    status: 'active' as const,
  }));
}

/** WorkflowPattern 形态（供写入 WorkflowPatternStore 时的最小结构约定）。 */
export type { WorkflowPattern };
