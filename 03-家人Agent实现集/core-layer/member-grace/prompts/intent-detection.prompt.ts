/**
 * 意图检测提示词模板（intent-detection.prompt）——创想·灵韵 prompts。
 * 自动生成自 presets/member-agent；请补齐 TODO(infra) 与业务逻辑。
 * 职责：为意图检测提供统一、可版本化的提示词模板（含运行时占位符）。
 * 边界：仅提供模板常量与渲染函数；模型调用归 providers/llm-adapter。
 *
 * TODO(infra): 接入 shared-core/procedural-memory 做提示词版本化与 A/B。
 */

/** 意图检测提示词（运行时占位符：{{USER_TEXT}} / {{INTENT_TYPES}} / {{SESSION_ID}}）。 */
export const INTENT_DETECTION_PROMPT = `你是 YYC³ AI Family 的「意图之门」。
请判断下列用户输入的意图类型，仅在给定类型中选择，并给出 0..1 的置信度。

可选意图类型：{{INTENT_TYPES}}
会话标识：{{SESSION_ID}}

用户输入：
"""{{USER_TEXT}}"""

输出要求（JSON）：
{"intent": "<类型>", "confidence": <0..1>, "reason": "<简短理由>"}
`;

/** 意图检测占位符取值。 */
export interface IntentDetectionVars {
  readonly userText: string;
  readonly intentTypes: readonly string[];
  readonly sessionId: string;
}

/** 渲染意图检测提示词。 */
export function renderIntentDetectionPrompt(vars: IntentDetectionVars): string {
  return INTENT_DETECTION_PROMPT.replace('{{USER_TEXT}}', vars.userText)
    .replace('{{INTENT_TYPES}}', vars.intentTypes.join(' / '))
    .replace('{{SESSION_ID}}', vars.sessionId);
}
