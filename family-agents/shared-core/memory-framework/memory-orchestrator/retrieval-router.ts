/**
 * 检索路由（retrieval-router）——「知」支柱 memory-orchestrator 子模块。
 * 职责：按**任务类型**把检索请求路由到不同记忆层，决定"查哪些层"。
 * 边界：只做层选择，不做实际检索。
 *
 * TODO(infra): 引入基于命中反馈的自适应路由（学习引擎回流优化路由表）。
 */

import type { MemoryLayer, TaskContext, TaskType } from '../types.js';

/** 默认任务类型 → 记忆层路由表。 */
export const DEFAULT_ROUTING: Readonly<Record<TaskType, readonly MemoryLayer[]>> = {
  // 意图分类：依赖会话上下文 + 领域知识 + 既定规则
  'intent-classification': ['working', 'semantic', 'procedural'],
  analysis: ['semantic', 'episodic'],
  prediction: ['episodic', 'semantic'],
  recommendation: ['semantic', 'working'],
  creation: ['episodic', 'semantic', 'procedural'],
  'quality-review': ['procedural', 'episodic'],
  'security-audit': ['procedural', 'semantic'],
  orchestration: ['working', 'episodic'],
  general: ['working', 'semantic'],
};

/** 检索路由器。 */
export class RetrievalRouter {
  constructor(
    private readonly rules: Readonly<Partial<Record<TaskType, readonly MemoryLayer[]>>> = DEFAULT_ROUTING,
  ) {}

  /**
   * 计算应检索的记忆层。
   * @param ctx 任务上下文
   * @param explicit 调用方显式指定的层（优先级最高）
   */
  route(ctx: TaskContext, explicit?: readonly MemoryLayer[]): readonly MemoryLayer[] {
    if (explicit && explicit.length > 0) return explicit;
    return this.rules[ctx.taskType] ?? DEFAULT_ROUTING.general;
  }
}
