/**
 * 技能行为评测契约（skill-eval）—— P3-T5。
 * 职责：定义「金样例 → 触发判定 → 步骤计划 → 产出结构」的可执行评测语义——
 *   金样例声明给定输入的期望（是否触发 / 产出必含字段 / 期望步骤），
 *   评测为纯函数（无 IO、无网络、无 LLM），默认 observe：偏差仅记录不阻断；
 *   `enforceEvalOutcome` 提供 enforce 路径（违规即抛），由治理侧显式启用。
 * 分词口径：与检索（P3-T4）同构的确定性词面切分（CJK 二元组 + latin/digit 词），
 *   本模块独立实现——内核不反向依赖 family-agents。
 */

/** 金样例（tests/skills/golden.json 的单个用例）。 */
export interface SkillGoldenCase {
  /** 技能统一 id（logicalId 命名空间）。 */
  readonly id: string;
  /** 给定输入（自然语言查询）。 */
  readonly input: string;
  /** 期望：该输入应/不应触发此技能。 */
  readonly expectTrigger: boolean;
  /** 期望调用的步骤 action（技能具备步骤计划时比对；缺省不比对）。 */
  readonly steps?: readonly string[];
  /** 产出结构必含字段（字段存在且值非空）。 */
  readonly requiredOutput: readonly string[];
}

/** 单例评测结论。 */
export interface SkillEvalOutcome {
  readonly id: string;
  readonly input: string;
  /** 实际触发判定结果。 */
  readonly triggered: boolean;
  /** 触发结果符合期望。 */
  readonly triggerOk: boolean;
  /** 步骤计划比对通过。 */
  readonly stepsOk: boolean;
  /** 产出结构合法。 */
  readonly outputOk: boolean;
  /** 全部偏差描述（空数组 = 通过）。 */
  readonly violations: readonly string[];
}

/** 汇总统计。 */
export interface SkillEvalSummary {
  readonly total: number;
  /** 实际触发例数。 */
  readonly triggered: number;
  /** 触发结果符合期望例数。 */
  readonly triggerOk: number;
  readonly stepsOk: number;
  readonly outputOk: number;
  /** 存在偏差（violations 非空）的例数。 */
  readonly deviations: number;
}

/** 评测模式：observe（默认，偏差仅记录）/ enforce（偏差阻断，治理显式升级）。 */
export const SKILL_EVAL_MODE: 'observe' | 'enforce' = 'observe';

/** 确定性词元切分：CJK 相邻二元组（单字回退）+ latin/digit 词，统一小写。 */
function tokenize(text: string): Set<string> {
  const lower = text.toLowerCase();
  const tokens = new Set<string>();
  for (const run of lower.match(/[\u3000-\u9fff\uff00-\uffef]+/g) ?? []) {
    if (run.length === 1) {
      tokens.add(run);
    } else {
      for (let i = 0; i < run.length - 1; i += 1) tokens.add(run.slice(i, i + 2));
    }
  }
  for (const word of lower.match(/[a-z0-9][a-z0-9-]*/g) ?? []) tokens.add(word);
  return tokens;
}

/**
 * 触发判定（词面）：输入与任一触发条件共享 ≥1 个词元即触发；
 * 空输入或空触发条件一律不触发。
 */
export function skillTriggersOn(when: readonly string[], input: string): boolean {
  const inputTokens = tokenize(input);
  if (inputTokens.size === 0) return false;
  for (const condition of when ?? []) {
    for (const token of tokenize(condition)) {
      if (inputTokens.has(token)) return true;
    }
  }
  return false;
}

/** 产出结构判定：必含字段全部存在且值非空（undefined / null / 空串视为缺失）。 */
export function outputShapeOk(
  output: Readonly<Record<string, unknown>> | undefined,
  requiredFields: readonly string[],
): boolean {
  if (!output || typeof output !== 'object') return false;
  return (requiredFields ?? []).every((field) => {
    const value = output[field];
    return value !== undefined && value !== null && value !== '';
  });
}

/** 被评技能的最小行为面（与 SkillRegistry 装载结果结构兼容，不 import 家族侧）。 */
export interface SkillBehaviorDef {
  readonly id?: string;
  /** 触发条件（清单技能即其 examples）。 */
  readonly when?: readonly string[];
  /** 步骤计划（描述态技能为空数组）。 */
  readonly steps?: readonly { readonly action: string }[];
}

/** 金样例评测（纯函数）：触发判定 + 步骤计划比对 + 产出结构判定。 */
export function evaluateSkillCase(
  skill: SkillBehaviorDef,
  output: Readonly<Record<string, unknown>> | undefined,
  c: SkillGoldenCase,
): SkillEvalOutcome {
  const violations: string[] = [];
  const triggered = skillTriggersOn(skill.when ?? [], c.input);
  if (triggered !== c.expectTrigger) {
    violations.push(`触发判定不符：期望 ${c.expectTrigger ? '触发' : '不触发'}，实际 ${triggered ? '触发' : '未触发'}`);
  }
  const expectedSteps = c.steps ?? [];
  const actions = new Set((skill.steps ?? []).map((s) => s.action));
  const missingSteps = expectedSteps.filter((action) => !actions.has(action));
  const stepsOk = missingSteps.length === 0;
  if (!stepsOk) violations.push(`步骤计划缺项：${missingSteps.join('、')}`);
  const outputOk = outputShapeOk(output, c.requiredOutput);
  if (!outputOk) violations.push(`产出结构非法：缺字段 ${c.requiredOutput.join('、')}`);
  return {
    id: c.id,
    input: c.input,
    triggered,
    triggerOk: triggered === c.expectTrigger,
    stepsOk,
    outputOk,
    violations,
  };
}

/** 汇总（observe 报表与 enforce 判定的共用口径）。 */
export function summarizeEval(outcomes: readonly SkillEvalOutcome[]): SkillEvalSummary {
  let triggered = 0;
  let triggerOk = 0;
  let stepsOk = 0;
  let outputOk = 0;
  let deviations = 0;
  for (const o of outcomes) {
    if (o.triggered) triggered += 1;
    if (o.triggerOk) triggerOk += 1;
    if (o.stepsOk) stepsOk += 1;
    if (o.outputOk) outputOk += 1;
    if (o.violations.length > 0) deviations += 1;
  }
  return { total: outcomes.length, triggered, triggerOk, stepsOk, outputOk, deviations };
}

/**
 * enforce 路径：存在偏差即抛错（由治理侧显式调用；observe 模式不经过此函数）。
 * 干净结论原样返回，便于链式记账。
 */
export function enforceEvalOutcome(outcome: SkillEvalOutcome): SkillEvalOutcome {
  if (outcome.violations.length > 0) {
    throw new Error(`技能行为评测失败（${outcome.id}）：${outcome.violations.join('；')}`);
  }
  return outcome;
}
