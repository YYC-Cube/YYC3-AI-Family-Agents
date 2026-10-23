/**
 * 意图处理总入口（intent-gateway.service）——智云·守护 core。
 * 自动生成自 presets/member-agent；请补齐 TODO(infra) 与业务逻辑。
 *
 * TODO(infra): 接入 family-communication-bus / llm-adapter。
 */

import type { JudgmentSignal } from '@shared/self-judge-kit';
import type { TaskContext, TaskType } from '@shared/memory-framework';

/** 请求。 */
export interface IntentRequest {
  readonly text: string;
  readonly sessionId: string;
  readonly traceId: string;
  readonly locale?: string;
}

/** 结果。 */
export interface IntentResult {
  readonly intent: string;
  readonly confidence: number;
  readonly judgment: JudgmentSignal;
  readonly routeTo: string;
  readonly latencyMs: number;
}

/** 意图处理总入口服务（member-guardian）。 */
export class IntentGatewayService {
  /**
   * 处理一次用户输入。
   * TODO(infra): 上下文写入 → 分类（含 self-judge）→ 路由 → 事件发布。
   */
  async handle(req: IntentRequest): Promise<IntentResult> {
    const startedAt = Date.now();
    const ctx: TaskContext = {
      traceId: req.traceId,
      agent: '010301-06',
      taskId: `intent-${req.traceId}`,
      taskType: 'general' satisfies TaskType,
      startedAt,
      scope: { agent: '010301-06', sessionId: req.sessionId },
    };
    void ctx;
    // TODO(infra): 调用意图分类器并组装结果
    throw new Error('IntentGatewayService.handle 未实现（骨架）');
  }
}
