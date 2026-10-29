/**
 * 查询解析提示词契约（query-parsing.prompt）——{{MEMBER_NAME}} prompts（P1-T5）。
 * 职责：CO-STAR 结构化查询解析模板 + 统一元数据（id/version/vars/outputSchema）。
 * 边界：仅提供模板常量、元数据与渲染函数；解析编排归 nlq/query-parser.service。
 * 版本：以 PROMPT_META 为准，回写 presets/family-manifest.yaml（manifest:check 零漂移）；
 *       A/B 通过清单中按家人固定 version 实现（id + version 即可寻址的变体键）。
 */

/** 查询解析元数据契约（严格 JSON，供 scripts/check-prompts.mjs 零依赖提取）。 */
export const PROMPT_META = {
  "id": "bole.query-parsing",
  "version": "1.0.0",
  "status": "production",
  "framework": "co-star",
  "blueprint": "1206-提示词工程-蓝图实战-编写规范",
  "vars": [
    {
      "name": "USER_TEXT",
      "description": "用户自然语言查询"
    },
    {
      "name": "SCHEMA_HINT",
      "description": "目标 schema 提示"
    },
    {
      "name": "LOCALE",
      "description": "查询语言区域"
    }
  ],
  "outputSchema": {
    "type": "object",
    "properties": {
      "entities": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "metrics": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "timeRange": {
        "type": [
          "object",
          "null"
        ]
      },
      "filters": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "confidence": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      }
    },
    "required": [
      "entities",
      "metrics",
      "timeRange",
      "filters",
      "confidence"
    ],
    "additionalProperties": false
  }
} as const;

/** 查询解析提示词（CO-STAR 七要素；占位符：{{USER_TEXT}} / {{SCHEMA_HINT}} / {{LOCALE}}）。 */
export const QUERY_PARSING_PROMPT = `【身份】你是 YYC³ AI Family 的结构化查询解析器。
【背景】管理者以自然语言查询经营数据，须转译为结构化槽位供下游 API 映射；语言：{{LOCALE}}。
【目标】把查询解析为实体/指标/时间范围/过滤四类槽位，并给出 0..1 自评置信度。
【范围】未知字段留空、不臆造；不执行查询、不推断业务数值。
【任务】1. 提取实体与指标；2. 解析时间范围与过滤条件；3. 汇总为 JSON 并自评置信度。
【受众】下游查询映射器按 JSON 机器解析，无需寒暄与解释性文字。
【响应】仅输出 JSON：{"entities": [], "metrics": [], "timeRange": null, "filters": [], "confidence": <0..1>}

目标 schema：{{SCHEMA_HINT}}
用户查询：
"""{{USER_TEXT}}"""`;

/** 查询解析占位符取值。 */
export interface QueryParsingVars {
  readonly userText: string;
  readonly schemaHint: string;
  readonly locale: string;
}

/** 渲染查询解析提示词。 */
export function renderQueryParsingPrompt(vars: QueryParsingVars): string {
  return QUERY_PARSING_PROMPT.replace('{{USER_TEXT}}', vars.userText)
    .replace('{{SCHEMA_HINT}}', vars.schemaHint)
    .replace('{{LOCALE}}', vars.locale);
}
