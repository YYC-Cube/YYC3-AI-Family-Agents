/**
 * 上下文窗口（context-window）——「知」支柱 working-context 子模块。
 * 职责：在 token 预算内做动态窗口分配（DWA），保证高注意力条目优先保留。
 * 边界：只负责分配与裁剪，不做内容生成。
 *
 * TODO(infra): token 计数替换为真实分词器（tiktoken / 模型侧计数）。
 */

/** 窗口候选条目（携带 token 估算与注意力权重）。 */
export interface WindowCandidate {
  readonly id: string;
  readonly content: unknown;
  /** token 估算值。 */
  readonly tokens: number;
  /** 由 attention-scorer 计算的权重 0–1。 */
  readonly weight: number;
}

/** 窗口分配结果。 */
export interface WindowAllocation {
  readonly selected: readonly WindowCandidate[];
  readonly dropped: readonly WindowCandidate[];
  readonly usedTokens: number;
  readonly budgetTokens: number;
}

/**
 * 动态窗口分配器。
 * 策略：按注意力权重降序贪心填充，直至预算耗尽（权重高者优先）。
 */
export class ContextWindow {
  constructor(private readonly budgetTokens = 128_000) {}

  /** 在预算内分配窗口。 */
  allocate(candidates: readonly WindowCandidate[], budget = this.budgetTokens): WindowAllocation {
    const ranked = [...candidates].sort((a, b) => b.weight - a.weight);
    const selected: WindowCandidate[] = [];
    const dropped: WindowCandidate[] = [];
    let used = 0;
    for (const c of ranked) {
      if (used + c.tokens <= budget) {
        selected.push(c);
        used += c.tokens;
      } else {
        dropped.push(c);
      }
    }
    // TODO(infra): 接入真实分词器做精确 token 计量；可选支持摘要压缩
    return { selected, dropped, usedTokens: used, budgetTokens: budget };
  }
}
