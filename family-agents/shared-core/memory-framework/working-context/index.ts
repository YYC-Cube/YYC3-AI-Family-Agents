/**
 * 工作上下文（working-context）——「知」支柱第 2 层。
 * 生命周期：会话期｜存储介质：内存 + Redis｜写入触发：注意力评分动态维护。
 */

import { AttentionScorer, type WorkingItem } from './attention-scorer.js';
import { ContextWindow, type WindowAllocation, type WindowCandidate } from './context-window.js';

export type { WorkingItem } from './attention-scorer.js';
export type { WindowAllocation, WindowCandidate } from './context-window.js';

/** 工作上下文端口。 */
export interface WorkingContextPort {
  put(item: WorkingItem): void;
  get(id: string): WorkingItem | undefined;
  /** 查询后重新计算注意力权重并返回窗口分配结果。 */
  attend(query: string, now: number): WindowAllocation;
  clear(): void;
}

/**
 * 工作上下文实现（内存桩）。
 * 维护会话内的注意焦点集合，随查询动态排序。
 */
export class WorkingContext implements WorkingContextPort {
  private readonly items = new Map<string, WorkingItem>();

  constructor(
    private readonly scorer: AttentionScorer = new AttentionScorer(),
    private readonly window: ContextWindow = new ContextWindow(),
  ) {}

  put(item: WorkingItem): void {
    this.items.set(item.id, item);
    // TODO(infra): 同步到 Redis 会话键，支持多实例共享
  }

  get(id: string): WorkingItem | undefined {
    return this.items.get(id);
  }

  attend(query: string, now: number): WindowAllocation {
    const candidates: WindowCandidate[] = [...this.items.values()].map((item) => ({
      id: item.id,
      content: item.content,
      // 桩实现：token 以内容长度粗估
      tokens: estimateTokens(item.content),
      weight: this.scorer.score(item, query, now),
    }));
    return this.window.allocate(candidates);
  }

  clear(): void {
    this.items.clear();
  }
}

/** 粗估 token 数（桩）。 */
function estimateTokens(content: unknown): number {
  const text = typeof content === 'string' ? content : JSON.stringify(content ?? '');
  return Math.max(1, Math.ceil(text.length / 4));
}
