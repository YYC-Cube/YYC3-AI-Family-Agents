/**
 * 自然语言查询解析服务（query-parser.service）——语枢·万物 nlq。
 * 自动生成自 presets/member-agent；请补齐 TODO(infra) 与业务逻辑。
 * 职责：把用户自然语言查询解析为结构化 Query AST（实体/指标/时间/过滤）。
 * 边界：只做"语言 → 结构"的解析；结构 → API 的映射归 query-to-api.mapper。
 *
 * TODO(infra): 接入 llm-adapter 做槽位填充；
 *              接入 shared-core/procedural-memory 加载 intent-rules.yaml。
 */

/** 词元种类。 */
export type TokenKind = 'entity' | 'metric' | 'time' | 'filter' | 'verb' | 'other';

/** 解析词元（带字符跨度，便于溯源高亮）。 */
export interface QueryToken {
  readonly text: string;
  readonly kind: TokenKind;
  readonly span: readonly [start: number, end: number];
}

/** 查询实体。 */
export interface QueryEntity {
  readonly name: string;
  readonly kind: string;
  readonly sourceText: string;
}

/** 时间范围（解析后的区间）。 */
export interface TimeRange {
  readonly from?: string; // ISO 8601
  readonly to?: string; // ISO 8601
  readonly granularity?: 'day' | 'week' | 'month' | 'quarter' | 'year';
}

/** 过滤条件。 */
export interface QueryFilter {
  readonly field: string;
  readonly op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  readonly value: string | readonly string[];
}

/** 解析结果（结构化查询）。 */
export interface ParsedQuery {
  readonly raw: string;
  readonly intentHint: string;
  readonly tokens: readonly QueryToken[];
  readonly entities: readonly QueryEntity[];
  readonly metrics: readonly string[];
  readonly timeRange?: TimeRange;
  readonly filters: readonly QueryFilter[];
  /** 解析置信度（0..1），供 self-judge 复核。 */
  readonly confidence: number;
}

/** 解析选项。 */
export interface ParseOptions {
  readonly locale?: string;
  /** 是否产出词元级溯源信息。 */
  readonly withTokens?: boolean;
}

/** 自然语言查询解析服务。 */
export class QueryParserService {
  constructor(private readonly defaultLocale = 'zh-CN') {}

  /**
   * 解析一段自然语言查询。
   * TODO(infra): 规则（intent-rules.yaml）+ LLM 槽位填充 融合解析。
   */
  parse(text: string, options: ParseOptions = {}): ParsedQuery {
    const raw = text.trim();
    const tokens = options.withTokens ? tokenize(raw) : [];
    // TODO(infra): 实体/指标/时间/过滤抽取（NER + 时间归一化）
    return {
      raw,
      intentHint: inferIntentHint(raw),
      tokens,
      entities: [],
      metrics: [],
      timeRange: undefined,
      filters: [],
      confidence: raw.length > 0 ? 0.5 : 0,
    };
  }

  /** 便捷入口：是否可解析（非空且置信度达阈值）。 */
  isResolvable(parsed: ParsedQuery, threshold = 0.6): boolean {
    return parsed.raw.length > 0 && parsed.confidence >= threshold;
  }

  /** 当前语言环境。 */
  locale(): string {
    return this.defaultLocale;
  }
}

function tokenize(text: string): readonly QueryToken[] {
  const out: QueryToken[] = [];
  let cursor = 0;
  for (const piece of text.split(/[\s,，。、;；:：]+/)) {
    const s = piece.trim();
    if (s.length === 0) continue;
    const start = text.indexOf(s, cursor);
    const end = start + s.length;
    out.push({ text: s, kind: classify(s), span: [start, end] });
    cursor = end;
  }
  return out;
}

function classify(word: string): TokenKind {
  if (/(年|月|日|周|季度|昨天|今天|明天|上周|下月|20\d{2})/.test(word)) return 'time';
  if (/(分析|统计|对比|报告|预测|推荐|创作|生成)/.test(word)) return 'verb';
  if (/(大于|小于|等于|高于|低于|超过|不低于)/.test(word)) return 'filter';
  if (/^[\d.]+$/.test(word)) return 'metric';
  return 'other';
}

function inferIntentHint(text: string): string {
  const map: readonly (readonly [string, string])[] = [
    ['分析', 'analysis'],
    ['统计', 'analysis'],
    ['预测', 'prediction'],
    ['推荐', 'recommendation'],
    ['创作', 'creation'],
    ['生成', 'creation'],
  ];
  for (const [kw, intent] of map) {
    if (text.includes(kw)) return intent;
  }
  return 'chat';
}
