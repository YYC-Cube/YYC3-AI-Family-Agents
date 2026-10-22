/**
 * OpenAI Provider（骨架）——预见·先知 providers。
 * 自动生成自 presets/member-agent；请补齐 TODO(infra) 与业务逻辑。
 * 职责：对接 OpenAI 兼容 API，提供补全/流式补全能力。
 * 边界：只做模型调用与响应整形；不承载业务意图。
 *
 * TODO(infra): 接入 shared-core/llm-adapter 统一适配层；
 *              密钥一律来自环境变量（禁止硬编码，§安全审查）。
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
  /** 是否要求返回各候选的 logprob（用于 confidence-scorer）。 */
  readonly logprobs?: boolean;
}

/** 补全响应。 */
export interface CompletionResponse {
  readonly text: string;
  /** 各候选 token/选项的 logprob（可选）。 */
  readonly logprobs?: readonly number[];
  readonly finishReason: string;
  readonly usage: { promptTokens: number; completionTokens: number };
}

/** OpenAI Provider。 */
export class OpenAiProvider {
  readonly name = 'openai';
  /** 每 token 成本（用于 SLO 与配额）。 */
  readonly costPerKToken = 0;

  constructor(
    private readonly apiKeyEnv = 'OPENAI_API_KEY',
    private readonly baseUrl = 'https://api.openai.com/v1',
  ) {}

  /** 是否可用（密钥存在性检查）。 */
  isAvailable(): boolean {
    // TODO(infra): 从进程环境读取 ${OPENAI_API_KEY}（不落盘、不日志）
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    return Boolean(env?.[this.apiKeyEnv]);
  }

  /** 标准补全。 */
  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    void req;
    void this.baseUrl;
    // TODO(infra): 发起 HTTP 请求（含重试 + 指数退避 + 幂等键）
    throw new Error('OpenAiProvider.complete 未实现（骨架）');
  }

  /** 流式补全（SSE）。 */
  async *stream(req: CompletionRequest): AsyncGenerator<string, void, void> {
    void req;
    // TODO(infra): 解析 SSE 增量，首字节目标 < 100ms
    throw new Error('OpenAiProvider.stream 未实现（骨架）');
  }
}
