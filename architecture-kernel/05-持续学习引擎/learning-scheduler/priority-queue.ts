/**
 * 学习任务优先级队列（priority-queue）——「学」支柱 learning-scheduler 子模块。
 * 职责：按优先级调度学习任务（素材价值 / 紧急度 / 回归成本）。
 * 语义（M23 由桩转实）：priority 降序有序插入（同分按入队序 FIFO，稳定）；
 *   dequeue 取最高优先级；peek 只看不取；list 只读快照。
 * 边界：只排序；资源配额归 budget-allocator；规模以百计（线性插入足够，
 *   最小堆待任务量上万再换——此处以确定性优先）。
 */

import type { LearningTask } from '../types.js';

/** 学习任务优先级队列（有序插入 · 稳定 FIFO）。 */
export class LearningPriorityQueue {
  private readonly items: LearningTask[] = [];

  /** 按 priority 降序插入；同分保持入队序（稳定）。 */
  enqueue(task: LearningTask): void {
    let i = this.items.length;
    while (i > 0 && (this.items[i - 1].priority ?? 0) < (task.priority ?? 0)) i -= 1;
    this.items.splice(i, 0, task);
  }

  /** 取出优先级最高的待办任务（队列空返回 undefined）。 */
  dequeue(): LearningTask | undefined {
    return this.items.shift();
  }

  /** 只看最高优先级任务（不取出）。 */
  peek(): LearningTask | undefined {
    return this.items[0];
  }

  /** 只读快照（优先级降序）。 */
  list(): readonly LearningTask[] {
    return [...this.items];
  }

  size(): number {
    return this.items.length;
  }
}
