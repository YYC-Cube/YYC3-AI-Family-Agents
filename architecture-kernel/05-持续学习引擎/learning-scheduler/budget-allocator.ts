/**
 * 学习资源配额（budget-allocator）——「学」支柱 learning-scheduler 子模块。
 * 职责：为学习任务分配 LLM token / 调用次数配额，防止学习挤占在线推理资源。
 * 语义（M23 由桩转实）：
 *   - allocate(task)：按「剩余配额 ∧ 任务申请」授予（token 与调用数分别取 min）；
 *     授予即从剩余中预扣（未消耗部分由消费方 release 归还）；
 *   - 任一维度剩余为 0 → 授予零配额（调用方应入队等待，超额任务降级异步）；
 *   - release(budget)：未消耗部分归还剩余（如执行失败提前退出）。
 * 边界：只分配配额；排队归 priority-queue；不做时钟/重试。
 */

import type { LearningBudget, LearningTask } from '../types.js';

/** 零配额（等待信号：任一维度为 0 即视为未获资源）。 */
export const ZERO_BUDGET: LearningBudget = { maxTokens: 0, maxCalls: 0 };

/** 学习资源配额分配器（剩余配额记账 + 授予预扣 + 归还）。 */
export class BudgetAllocator {
  private remaining: LearningBudget;

  constructor(total: LearningBudget) {
    if (total.maxTokens < 0 || total.maxCalls < 0) throw new Error('总配额不可为负');
    this.remaining = { ...total };
  }

  /** 剩余配额快照。 */
  get available(): LearningBudget {
    return { ...this.remaining };
  }

  /** 是否已耗尽（任一维度为 0）。 */
  get exhausted(): boolean {
    return this.remaining.maxTokens <= 0 || this.remaining.maxCalls <= 0;
  }

  /**
   * 按剩余配额为任务授予资源：token 与调用数分别取 min（申请，剩余），授予即预扣。
   * 耗尽或申请非法 → 零配额（不入账）；高优先级不越权（先到先得 + 调用方排队策略）。
   */
  allocate(task: LearningTask): LearningBudget {
    const asked = task.budget;
    if (asked.maxTokens <= 0 || asked.maxCalls <= 0) return ZERO_BUDGET;
    if (this.exhausted) return ZERO_BUDGET;
    const granted = {
      maxTokens: Math.min(asked.maxTokens, this.remaining.maxTokens),
      maxCalls: Math.min(asked.maxCalls, this.remaining.maxCalls),
    };
    if (granted.maxTokens <= 0 || granted.maxCalls <= 0) return ZERO_BUDGET;
    this.remaining = {
      maxTokens: this.remaining.maxTokens - granted.maxTokens,
      maxCalls: this.remaining.maxCalls - granted.maxCalls,
    };
    return granted;
  }

  /** 归还未消耗配额（执行失败 / 提前退出；负数部分按 0 计）。 */
  release(unused: LearningBudget): void {
    this.remaining = {
      maxTokens: this.remaining.maxTokens + Math.max(0, unused.maxTokens),
      maxCalls: this.remaining.maxCalls + Math.max(0, unused.maxCalls),
    };
  }
}
