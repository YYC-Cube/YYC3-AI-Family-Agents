/**
 * 查询解析提示词模板（query-parsing.prompt）——预见·先知 prompts。
 * 自动生成自 presets/member-agent；请补齐 TODO(infra) 与业务逻辑。
 * 职责：把自然语言查询解析为结构化槽位（实体/指标/时间/过滤）。
 * 边界：仅提供模板常量与渲染函数；解析编排归 nlq/query-parser.service。
 *
 * TODO(infra): 与 procedural/intent-rules.yaml 同步，做提示词版本化管理。
 */

/** 查询解析提示词（运行时占位符：{{USER_TEXT}} / {{SCHEMA_HINT}} / {{LOCALE}}）。 */
export const QUERY_PARSING_PROMPT = `你是结构化查询解析器。
请把用户查询解析为 JSON 槽位，未知字段留空，不要臆造。

目标 schema：{{SCHEMA_HINT}}
语言：{{LOCALE}}

用户查询：
"""{{USER_TEXT}}"""

输出要求（JSON）：
{"entities": [], "metrics": [], "timeRange": null, "filters": [], "confidence": <0..1>}
`;

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
