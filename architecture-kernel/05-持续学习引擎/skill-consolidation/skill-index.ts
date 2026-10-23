/**
 * 技能元数据索引契约（skill-index）—— P3-T4 渐进披露检索。
 * 职责：定义「索引 ↔ 正文分离」的元数据格式与 token 预算口径——
 *   索引条目仅含 id + 一句描述 + tags（≤ SKILL_INDEX_TOKEN_BUDGET token），
 *   不含 steps / examples 等正文；检索先查索引，命中后才加载正文（渐进披露）。
 * 预算执行点：生成器落盘（skills/index.json）+ CI 契约门禁；运行时加载不做预算校验。
 */

/** 技能元数据索引条目（正文分离：无 steps / examples / when）。 */
export interface SkillIndexEntry {
  readonly id: string;
  readonly version?: string;
  readonly scope?: 'shared' | 'dedicated';
  /** 专用技能的家人 slug，共用技能为 'shared'。 */
  readonly owner?: string;
  /** 一句描述（索引检索主字段）。 */
  readonly description: string;
  readonly tags?: readonly string[];
}

/** 单条索引条目的 token 预算（演进指导 §4.2 P3-T4）。 */
export const SKILL_INDEX_TOKEN_BUDGET = 200;

/**
 * 确定性 token 估算：CJK 码点每字计 1，其余字符每 4 个计 1（向上取整）。
 * 零依赖近似口径，仅用于预算判定，不声称等价任何具体分词器。
 */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (/[\u3000-\u9fff\uff00-\uffef]/u.test(ch)) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 4);
}

/** 索引条目 token 数（id + 描述 + tags 的估算口径）。 */
export function indexEntryTokens(entry: Pick<SkillIndexEntry, 'id' | 'description' | 'tags'>): number {
  return estimateTokens([entry.id, entry.description, ...(entry.tags ?? [])].join(' '));
}

/** 条目是否在预算内。 */
export function indexEntryWithinBudget(entry: Pick<SkillIndexEntry, 'id' | 'description' | 'tags'>): boolean {
  return indexEntryTokens(entry) <= SKILL_INDEX_TOKEN_BUDGET;
}
