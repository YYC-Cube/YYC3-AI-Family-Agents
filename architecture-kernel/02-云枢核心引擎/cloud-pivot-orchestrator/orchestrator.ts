/**
 * 云枢编排器（cloud-pivot-orchestrator）—— 接收千行意图解析 → 任务分解 → 调度家人执行。
 * 边界：只负责编排与调度编排；业务执行归各家人，策略裁决归治理中心，
 *       外部真值校验归同目录 verification-gateway。
 *
 * TODO(infra): 接入 family-communication-bus 完成家人调度与全链路 traceId 追踪。
 */

import { TaskDecomposer } from './task-decomposer.js';
import type { DispatchResult, Intent, TaskPlan } from '../types.js';

/** 云枢编排器。 */
export class CloudPivotOrchestrator {
  private readonly decomposer: TaskDecomposer;

  constructor(decomposer?: TaskDecomposer) {
    this.decomposer = decomposer ?? new TaskDecomposer();
  }

  /** 接收千行意图，产出任务计划（CAGEERF 分解）。 */
  plan(intent: Intent): TaskPlan {
    return this.decomposer.decompose(intent);
  }

  /**
   * 调度家人执行任务计划。
   * TODO(infra): 按 step.owner 经总线分发；低置信/大偏离时经 verification-gateway 校验。
   */
  async dispatch(plan: TaskPlan): Promise<DispatchResult> {
    return {
      traceId: plan.traceId,
      dispatched: plan.steps.map((step) => step.owner),
      failed: [],
    };
  }
}
