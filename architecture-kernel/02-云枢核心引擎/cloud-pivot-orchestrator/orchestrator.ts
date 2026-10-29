/**
 * 云枢编排器（cloud-pivot-orchestrator）—— 接收千行意图解析 → 任务分解 → 调度家人执行。
 * 语义（M26 由桩转实）：
 *   - plan(intent)：CAGEERF 分解（归 decomposer，不变）；
 *   - dispatch(plan)：**逐步真实分发**——注入式 `StepDispatcher` 端口按 step.owner
 *     承接（总线适配由装配/部署侧实现该端口，内核不硬接 EventBus）；
 *     逐 step 记录成功/失败（失败不中断后续步骤），traceId 贯穿端口入参；
 *   - 低置信预检：intent.confidence < threshold 时经注入 `DispatchVerifier` 仲裁
 *     （对齐 verification-gateway 语义；缺省不启用）。
 * 边界：只负责编排与调度；业务执行归各家人，策略裁决归治理中心。
 */

import { TaskDecomposer } from './task-decomposer.js';
import type { DispatchResult, Intent, TaskPlan, TaskStep } from '../types.js';

/** 步骤分发端口（部署侧实现：接 family-communication-bus / 家人运行时）。 */
export interface StepDispatcher {
  /** 分发单步；resolve = 成功，reject/throw = 失败（编排器记账不中断）。 */
  dispatch(step: TaskStep, plan: TaskPlan): Promise<void>;
}

/** 分发前仲裁端口（低置信预检；接入 verification-gateway 语义）。 */
export interface DispatchVerifier {
  /** 返回 false = 仲裁拦截（dispatch 整体拒绝并回 reason）。 */
  allow(plan: TaskPlan, intentConfidence: number): Promise<boolean> | boolean;
}

/** 编排器选项（全部注入式，缺省行为与既有消费者兼容）。 */
export interface OrchestratorOptions {
  /** 分解器（缺省自建）。 */
  readonly decomposer?: TaskDecomposer;
  readonly dispatcher?: StepDispatcher;
  readonly verifier?: DispatchVerifier;
  /** 低置信阈值（缺省 0.6，对齐 self-judge τ_low）。 */
  readonly confidenceFloor?: number;
}

/** 云枢编排器。 */
export class CloudPivotOrchestrator {
  private readonly decomposer: TaskDecomposer;
  private readonly dispatcher?: StepDispatcher;
  private readonly verifier?: DispatchVerifier;
  private readonly confidenceFloor: number;

  constructor(decomposerOrOptions?: TaskDecomposer | OrchestratorOptions) {
    const options: OrchestratorOptions =
      decomposerOrOptions instanceof TaskDecomposer
        ? { decomposer: decomposerOrOptions }
        : decomposerOrOptions ?? {};
    this.decomposer = options.decomposer ?? new TaskDecomposer();
    this.dispatcher = options.dispatcher;
    this.verifier = options.verifier;
    this.confidenceFloor = options.confidenceFloor ?? 0.6;
  }

  /** 接收千行意图，产出任务计划（CAGEERF 分解）。 */
  plan(intent: Intent): TaskPlan {
    return this.decomposer.decompose(intent);
  }

  /**
   * 调度家人执行任务计划：低置信仲裁 → 逐步分发（失败记账不中断）。
   * 未注入 dispatcher 时退化为原「仅产出承接清单」语义（dispatched=owners, failed=[]）。
   */
  async dispatch(plan: TaskPlan, intentConfidence = 1): Promise<DispatchResult> {
    if (this.verifier) {
      const allowed = await this.verifier.allow(plan, intentConfidence);
      if (!allowed) {
        return { traceId: plan.traceId, dispatched: [], failed: plan.steps.map((s) => s.owner) };
      }
    }
    if (!this.dispatcher) {
      return { traceId: plan.traceId, dispatched: plan.steps.map((step) => step.owner), failed: [] };
    }
    const dispatched: string[] = [];
    const failed: string[] = [];
    for (const step of plan.steps) {
      try {
        await this.dispatcher.dispatch(step, plan);
        dispatched.push(step.owner);
      } catch {
        failed.push(step.owner);
      }
    }
    return { traceId: plan.traceId, dispatched, failed };
  }
}
