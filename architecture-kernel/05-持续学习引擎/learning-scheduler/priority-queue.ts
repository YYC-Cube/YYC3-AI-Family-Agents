/**
 * 学习任务优先级队列（priority-queue）——「学」支柱 learning-scheduler 子模块。
 * 职责：按优先级调度学习任务（素材价值 / 紧急度 / 回归成本）。
 * 边界：只排序；资源配额归 budget-allocator。
 *
 * TODO(infra): 接入总线调度；优先级 = f(素材价值, 时效, 回归风险)；替换为最小堆。
 */

import type { LearningTask } from '../types.js';

/** 学习任务优先级队列（内存桩，FIFO）。 */
export class LearningPriorityQueue {
  private readonly items: LearningTask[] = [];

  enqueue(task: LearningTask): void {
    // TODO(infra): 按 priority 有序插入（最小堆）
    this.items.push(task);
  }

  /** 取出优先级最高的待办任务。 */
  dequeue(): LearningTask | undefined {
    // TODO(infra): 替换为最小堆实现，真正按 priority 出队
    return this.items.shift();
  }

  size(): number {
    return this.items.length;
  }
}
