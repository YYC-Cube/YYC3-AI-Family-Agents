/**
 * LLM 适配层类型（shared-core/llm-adapter）—— provider 统一契约。
 * 边界：只定义模型调用的输入/输出与错误语义；具体 provider 负责协议适配。
 * 安全：密钥一律来自环境变量，禁止落盘/日志。
 */

/** 单条消息。 */
export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

/** 补全请求。 */
export interface CompletionRequest {
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  /** 是否要求返回 logprob（用于 confidence-scorer）。 */
  readonly logprobs?: boolean;
}

/** 补全响应。 */
export interface CompletionResponse {
  readonly text: string;
  /** token 级 logprob（可选）。 */
  readonly logprobs?: readonly number[];
  readonly finishReason: string;
  readonly usage: { promptTokens: number; completionTokens: number };
}

/** Provider 统一错误（status 为 HTTP 状态；retryable 表示是否可重试）。 */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
