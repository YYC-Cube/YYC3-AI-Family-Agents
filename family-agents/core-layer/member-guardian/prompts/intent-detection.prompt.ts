/**
 * 意图检测提示词契约（intent-detection.prompt）——智云·守护 prompts（P1-T5）。
 * 职责：CO-STAR 结构化意图检测模板 + 统一元数据（id/version/vars/outputSchema）。
 * 边界：仅提供模板常量、元数据与渲染函数；模型调用归 providers/llm-adapter。
 * 版本：以 PROMPT_META 为准，回写 presets/family-manifest.yaml（manifest:check 零漂移）；
 *       A/B 通过清单中按家人固定 version 实现（id + version 即可寻址的变体键）。
 */

/** 意图检测元数据契约（严格 JSON，供 scripts/check-prompts.mjs 零依赖提取）。 */
export const PROMPT_META = {
  "id": "guardian.intent-detection",
  "version": "1.0.0",
  "status": "production",
  "framework": "co-star",
  "blueprint": "1206-提示词工程-蓝图实战-编写规范",
  "vars": [
    {
      "name": "USER_TEXT",
      "description": "用户原始输入"
    },
    {
      "name": "INTENT_TYPES",
      "description": "候选意图类型闭集"
    },
    {
      "name": "SESSION_ID",
      "description": "会话标识"
    }
  ],
  "outputSchema": {
    "type": "object",
    "properties": {
      "intent": {
        "type": "string",
        "minLength": 1
      },
      "confidence": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "reason": {
        "type": "string"
      }
    },
    "required": [
      "intent",
      "confidence",
      "reason"
    ],
    "additionalProperties": false
  }
} as const;

/** 意图检测提示词（CO-STAR 七要素；占位符：{{USER_TEXT}} / {{INTENT_TYPES}} / {{SESSION_ID}}）。 */
export const INTENT_DETECTION_PROMPT = `【身份】你是 YYC³ AI Family 的「意图之门」。
【背景】用户输入来自管理会话，须先判意图再路由家人；会话标识：{{SESSION_ID}}。
【目标】从候选类型中选出唯一意图，并给出 0..1 置信度；拿不准时选最接近者并降低置信度。
【范围】仅在候选类型内判断；不改写输入、不执行任务、不臆造候选之外的意图。
【任务】1. 通读用户输入；2. 与候选类型逐一比对；3. 选定唯一意图并自评置信度；4. 一句话陈述理由。
【受众】下游路由器按 JSON 机器解析，无需寒暄与解释性文字。
【响应】仅输出 JSON：{"intent": "<类型>", "confidence": <0..1>, "reason": "<简短理由>"}

可选意图类型：{{INTENT_TYPES}}
用户输入：
"""{{USER_TEXT}}"""`;

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
