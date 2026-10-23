/**
 * 注意力评分器（attention-scorer）——「知」支柱 working-context 子模块。
 * 职责：对工作记忆条目按相关性加权，动态决定"什么留在注意力窗口内"。
 * 边界：只做相关性加权，不做检索（检索归 memory-orchestrator）。
 *
 * TODO(infra): 以轻量检索模型（如嵌入余弦相似度）替换启发式打分。
 */

/** 工作记忆条目。 */
export interface WorkingItem {
  readonly id: string;
  readonly content: unknown;
  /** 基础显著度 0–1（来自写入时的 salience）。 */
  readonly salience: number;
  /** 最近一次被访问的事件时间。 */
  readonly lastAccessTs: number;
  /** 关键词/实体，用于相关性匹配。 */
  readonly keywords: readonly string[];
}

/** 评分权重配置。 */
export interface AttentionWeights {
  /** 相关性权重（默认 0.5）。 */
  readonly relevance: number;
  /** 显著度权重（默认 0.3）。 */
  readonly salience: number;
  /** 新近度权重（默认 0.2）。 */
  readonly recency: number;
}

export const DEFAULT_ATTENTION_WEIGHTS: AttentionWeights = {
  relevance: 0.5,
  salience: 0.3,
  recency: 0.2,
};

/** 注意力评分器。 */
export class AttentionScorer {
  constructor(private readonly weights: AttentionWeights = DEFAULT_ATTENTION_WEIGHTS) {}

  /** 计算条目在给定查询下的注意力权重 0–1。 */
  score(item: WorkingItem, query: string, now: number, halfLifeMs = 60_000): number {
    const relevance = this.relevance(item.keywords, query);
    const recency = this.recency(item.lastAccessTs, now, halfLifeMs);
    const s =
      this.weights.relevance * relevance +
      this.weights.salience * item.salience +
      this.weights.recency * recency;
    return clamp01(s);
  }

  /** 关键词/查询匹配相关性（启发式：命中率）。 */
  private relevance(keywords: readonly string[], query: string): number {
    if (keywords.length === 0) return 0;
    const q = query.toLowerCase();
    const hit = keywords.filter((k) => q.includes(k.toLowerCase())).length;
    // TODO(infra): 替换为嵌入向量余弦相似度
    return clamp01(hit / keywords.length);
  }

  /** 指数衰减新近度。 */
  private recency(lastAccessTs: number, now: number, halfLifeMs: number): number {
    const dt = Math.max(0, now - lastAccessTs);
    return Math.pow(0.5, dt / halfLifeMs);
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
