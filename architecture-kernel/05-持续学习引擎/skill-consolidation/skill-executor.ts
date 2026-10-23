/**
 * 技能执行引擎（skill-executor）—— P6-B（M15）· 确定性执行臂。
 * 职责：对 manifest 技能条目（P3-T1② 步骤/io 契约）做确定性执行——
 *   ① 输入契约校验：io.input 声明字段逐一核验（存在 / 非空）；
 *   ② 触发核验：复用 skill-eval 的 skillTriggersOn（examples/tags 词面命中）；
 *   ③ 步骤计划：steps 全量展开为待执行计划（自然语言步骤的语义执行归 LLM 臂，
 *      M16 接入；本臂不假装执行 NL 步骤）；
 *   ④ 输出骨架：io.output 字段展开为待填充骨架（值 null）。
 * 边界：纯函数零 IO；输入为「已解析的清单条目」（内核不读 presets）；
 *       触发语义与金样例评测（skill-eval）同源，不重复实现。
 */

import { skillTriggersOn } from './skill-eval.js';

/** 可执行技能条目（manifest 技能的最小结构面）。 */
export interface ExecutableSkillEntry {
  readonly id: string;
  readonly version?: string;
  readonly steps?: readonly string[];
  readonly io?: {
    readonly input?: readonly string[];
    readonly output?: readonly string[];
  };
  readonly examples?: readonly string[];
  readonly tags?: readonly string[];
}

/** 步骤计划项（order 从 1 起；执行方式当前仅 LLM 臂，M16 起可扩展 kernel 臂）。 */
export interface StepPlanItem {
  readonly order: number;
  readonly text: string;
  readonly exec: 'llm' | 'kernel';
}

/** 确定性执行结果（mode 于 M16 起可扩展语义臂标记）。 */
export interface SkillExecutionResult {
  readonly skill: string;
  readonly version: string;
  readonly mode: 'deterministic' | 'llm-assisted';
  /** 词面触发核验（examples/tags 命中主输入文本；信息性，不作错误判据）。 */
  readonly triggered: boolean;
  /** 输入契约是否通过（io.input 全部字段存在且非空；未声明 io 视为通过）。 */
  readonly inputOk: boolean;
  readonly inputViolations: readonly string[];
  /** 步骤执行计划（自然语言步骤待 LLM 臂接续）。 */
  readonly plan: readonly StepPlanItem[];
  /** 输出骨架（确定性臂为 io.output 字段 → null 待填充；LLM 臂为已填充值）。 */
  readonly output: Readonly<Record<string, unknown>>;
  /** 是否存在待 LLM 臂执行的步骤（false = 纯契约技能或无步骤）。 */
  readonly llmRequired: boolean;
}

/** 取主输入文本（首个字符串值字段；触发核验的语料源）。 */
function primaryText(input: Readonly<Record<string, unknown>>): string {
  for (const value of Object.values(input ?? {})) {
    if (typeof value === 'string' && value.length > 0) return value;
    if (Array.isArray(value)) {
      const first = value.find((v) => typeof v === 'string' && v.length > 0);
      if (first) return first as string;
    }
  }
  return '';
}

/**
 * 确定性执行一条 manifest 技能：契约校验 + 触发核验 + 步骤计划 + 输出骨架。
 * 输入契约违反由调用方决定处置（tools/call 语义下抛错走 isError，保证 error 率可观测）。
 */
export function executeManifestSkill(
  entry: ExecutableSkillEntry,
  input: Readonly<Record<string, unknown>>,
): SkillExecutionResult {
  const inputViolations: string[] = [];
  for (const field of entry.io?.input ?? []) {
    const value = (input ?? {})[field];
    const empty =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim().length === 0) ||
      (Array.isArray(value) && value.length === 0);
    if (value === undefined || value === null) inputViolations.push(`缺少输入字段：${field}`);
    else if (empty) inputViolations.push(`输入字段为空：${field}`);
  }

  const triggered = skillTriggersOn(entry.examples ?? entry.tags ?? [], primaryText(input));
  const plan: StepPlanItem[] = (entry.steps ?? []).map((text, index) => ({
    order: index + 1,
    text,
    exec: 'llm',
  }));
  const output: Record<string, null> = {};
  for (const field of entry.io?.output ?? []) output[field] = null;

  return {
    skill: entry.id,
    version: entry.version ?? '0.0.0',
    mode: 'deterministic',
    triggered,
    inputOk: inputViolations.length === 0,
    inputViolations,
    plan,
    output,
    llmRequired: plan.length > 0,
  };
}
