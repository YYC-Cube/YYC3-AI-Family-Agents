/**
 * 学习资源配额（budget-allocator）——「学」支柱 learning-scheduler 子模块。
 * 职责：为学习任务分配 LLM token / 调用次数配额，防止学习挤占在线推理资源。
 * 边界：只分配配额；排队归 priority-queue。
 *
 * TODO(infra): 对接成本中心；超额任务降级为低优先级异步执行。
 */

import type { LearningBudget, LearningTask } from '../types.js';

/** 学习资源配额分配器。 */
export class BudgetAllocator {
  constructor(private readonly total: LearningBudget) {}

  /** 按优先级为任务分配配额（桩：返回总量）。 */
  allocate(task: LearningTask): LearningBudget {
    // TODO(infra): 依据剩余配额与优先级动态分配；不足则排队等待
    void task;
    return this.total;
  }
}
