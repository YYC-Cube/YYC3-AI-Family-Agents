/**
 * 意图处理总入口（intent-gateway.service）——言启·千行 core。
 * 职责：接收用户输入 → NLU → 意图分类（含自我判断）→ 路由给专业家人。
 * 边界：只做意图与路由；不执行下游业务（归对应家人）。
 *
 * TODO(infra): 接入 family-communication-bus 发布 intent.classified 事件；
 *              接入 llm-adapter 多模型（openai/zhipu/ollama 降级链）。
 */

import type { JudgmentSignal } from '@shared/self-judge-kit';
import type { TaskContext, TaskType } from '@shared/memory-framework';
import { IntentClassifierService } from './intent-classifier.service.js';
import { ContextManagerService } from './context-manager.service.js';

/** 意图类型（对齐路由目标家人）。 */
export type IntentType =
  | 'analysis' // → 语枢·万物
  | 'prediction' // → 预见·先知
  | 'recommendation' // → 千里·伯乐
  | 'creation' // → 创想·灵韵
  | 'orchestration' // → 元启·天枢
  | 'chat'
  | 'unknown';

/** 意图处理请求。 */
export interface IntentRequest {
  readonly text: string;
  readonly sessionId: string;
  readonly traceId: string;
  readonly locale?: string;
  readonly userId?: string;
}

/** 意图处理结果。 */
export interface IntentResult {
  readonly intent: IntentType;
  readonly confidence: number;
  /** 【自】结构化判断信号。 */
  readonly judgment: JudgmentSignal;
  /** 路由目标（家人在 agent.yaml 中声明）。 */
  readonly routeTo: string;
  readonly latencyMs: number;
}

/** 意图处理总入口服务。 */
export class IntentGatewayService {
  constructor(
    private readonly classifier: IntentClassifierService = new IntentClassifierService(),
    private readonly context: ContextManagerService = new ContextManagerService(),
  ) {}

  /**
   * 处理一次用户输入。
   * 流程：写入上下文 → 分类（含自我判断）→ 映射意图/路由 → 记录轨迹。
   */
  async handle(req: IntentRequest): Promise<IntentResult> {
    const startedAt = Date.now();
    this.context.appendTurn(req.sessionId, { role: 'user', text: req.text, ts: startedAt });

    const ctx: TaskContext = {
      traceId: req.traceId,
      agent: '010301-01',
      taskId: `intent-${req.traceId}`,
      taskType: 'intent-classification' satisfies TaskType,
      startedAt,
      scope: { agent: '010301-01', sessionId: req.sessionId },
    };

    const classified = await this.classifier.classify({ text: req.text, ctx });
    // TODO(infra): 低置信度/高偏离 → escalation（cross-validate/human-confirm）联动
    // TODO(infra): 发布 intent.classified 事件至 family-communication-bus

    return {
      intent: toIntentType(classified.primary.label),
      confidence: classified.judgment.confidence,
      judgment: classified.judgment,
      routeTo: routeOf(toIntentType(classified.primary.label)),
      latencyMs: Date.now() - startedAt,
    };
  }
}

/** 候选标签 → 意图类型。 */
function toIntentType(label: string): IntentType {
  const map: Record<string, IntentType> = {
    analysis: 'analysis',
    prediction: 'prediction',
    recommendation: 'recommendation',
    creation: 'creation',
    orchestration: 'orchestration',
    chat: 'chat',
  };
  return map[label] ?? 'unknown';
}

/** 意图 → 目标家人（热线/编号）。 */
function routeOf(intent: IntentType): string {
  const map: Record<IntentType, string> = {
    analysis: '010301-02', // 语枢·万物
    prediction: '010301-03', // 预见·先知
    recommendation: '010301-04', // 千里·伯乐
    creation: '010301-08', // 创想·灵韵
    orchestration: '010301-05', // 元启·天枢
    chat: '010301-01',
    unknown: '010301-05', // 兜底上呈天枢
  };
  return map[intent];
}
