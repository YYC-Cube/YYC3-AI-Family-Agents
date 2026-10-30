/**
 * OpenAI 兼容客户端（shared-core/llm-adapter）—— 共享 HTTP/重试/流式实现。
 * 适用：OpenAI、智谱 GLM 等遵循 `/chat/completions` 协议的服务。
 * 边界：协议适配（payload/headers）由子类覆盖；本类只做传输、重试、解析与错误分类。
 * 安全：密钥仅从环境变量读取；不落盘、不打印、错误不回显密钥。
 */

import type { ChatMessage, CompletionRequest, CompletionResponse } from './types.js';
import { ProviderError } from './types.js';

export type { ChatMessage, CompletionRequest, CompletionResponse } from './types.js';
export { ProviderError } from './types.js';

/** 兼容客户端选项。 */
export interface OpenAiCompatibleOptions {
  /** 密钥环境变量名，如 OPENAI_API_KEY / ZHIPU_API_KEY。 */
  readonly apiKeyEnv: string;
  /** 基础地址，如 https://api.openai.com/v1。 */
  readonly baseUrl: string;
  /** 超时毫秒，默认 30s。 */
  readonly timeoutMs?: number;
  /** 重试次数（不含首次），默认 2。 */
  readonly maxRetries?: number;
  /** 退避基数毫秒，默认 300（指数：base * 2^attempt）。 */
  readonly retryBaseMs?: number;
  /** 注入 fetch（测试用）。 */
  readonly fetchImpl?: typeof fetch;
  /** 附加请求头（如 OpenAI-Organization）。 */
  readonly extraHeaders?: Readonly<Record<string, string>>;
}

/** 兼容响应（仅声明使用到的字段）。 */
interface CompatResponse {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string; readonly reasoning_content?: string };
    readonly finish_reason?: string;
    readonly logprobs?: { readonly content?: readonly { readonly logprob?: number }[] };
  }[];
  readonly usage?: { readonly prompt_tokens?: number; readonly completion_tokens?: number };
}

/** OpenAI 兼容客户端基类。 */
export class OpenAiCompatibleClient {
  readonly name: string;
  /** 每 K token 成本（占位；按实际计费策略配置）。 */
  readonly costPerKToken = 0;

  protected readonly apiKeyEnv: string;
  protected readonly baseUrl: string;
  protected readonly extraHeaders: Readonly<Record<string, string>>;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(name: string, options: OpenAiCompatibleOptions) {
    this.name = name;
    this.apiKeyEnv = options.apiKeyEnv;
    this.baseUrl = options.baseUrl;
    this.extraHeaders = options.extraHeaders ?? {};
    this.timeoutMs = Math.max(1, options.timeoutMs ?? 30_000);
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
    this.retryBaseMs = Math.max(0, options.retryBaseMs ?? 300);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** 是否可用（密钥存在性检查）。 */
  isAvailable(): boolean {
    return Boolean(this.readKey());
  }

  /** 标准补全。 */
  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const key = this.requireKey();
    const res = await this.request(key, req, false);
    const text = await res.text();
    return this.parseResponse(text, res.status);
  }

  /** 流式补全（SSE 增量）。 */
  async *stream(req: CompletionRequest): AsyncGenerator<string, void, void> {
    const key = this.requireKey();
    const res = await this.request(key, req, true);
    const body = res.body;
    if (!body) throw new ProviderError('响应不含流式内容', res.status, false);

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const event of events) {
          for (const line of event.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') return;
            if (!data) continue;
            const chunk = this.parseChunk(data);
            if (chunk) yield chunk;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /** 消息构造辅助（供上层复用）。 */
  static buildMessages(system: string, history: readonly ChatMessage[]): readonly ChatMessage[] {
    return [{ role: 'system', content: system }, ...history];
  }

  // ---------- 内部 ----------

  private readKey(): string | undefined {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    const value = env?.[this.apiKeyEnv];
    return value && value.trim() ? value.trim() : undefined;
  }

  private requireKey(): string {
    const key = this.readKey();
    if (!key) throw new ProviderError(`未配置环境变量 ${this.apiKeyEnv}（禁止硬编码密钥）`, undefined, false);
    return key;
  }

  private endpoint(): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  }

  /** 请求体（子类可覆盖以追加供应商专有字段）。 */
  protected payload(req: CompletionRequest, stream: boolean): Record<string, unknown> {
    return {
      model: req.model,
      messages: req.messages,
      stream,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
      ...(req.logprobs ? { logprobs: true } : {}),
      ...(req.reasoning ? { reasoning: req.reasoning } : {}),
    };
  }

  /** 带超时与指数退避的请求（非 2xx 仅在 429/5xx 重试）。 */
  private async request(key: string, req: CompletionRequest, stream: boolean): Promise<Response> {
    let lastError: ProviderError | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(this.endpoint(), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            Accept: stream ? 'text/event-stream' : 'application/json',
            ...this.extraHeaders,
          },
          body: JSON.stringify(this.payload(req, stream)),
          signal: controller.signal,
        });
        if (res.ok) return res;

        const detail = (await res.text().catch(() => '')).slice(0, 200);
        const err = new ProviderError(
          `${this.name} 接口返回 ${res.status}${detail ? `：${detail}` : ''}`,
          res.status,
          res.status === 429 || res.status >= 500,
        );
        if (!err.retryable || attempt === this.maxRetries) throw err;
        lastError = err;
      } catch (e) {
        if (e instanceof ProviderError) {
          if (!e.retryable || attempt === this.maxRetries) throw e;
          lastError = e;
        } else {
          const message = e instanceof Error ? e.message : String(e);
          const timeout = e instanceof Error && (e.name === 'AbortError' || /abort/i.test(message));
          const err = new ProviderError(
            timeout ? `${this.name} 请求超时（>${this.timeoutMs}ms）` : `${this.name} 请求失败：${message}`,
            undefined,
            true,
          );
          if (attempt === this.maxRetries) throw err;
          lastError = err;
        }
      } finally {
        clearTimeout(timer);
      }
      await this.sleep(this.retryBaseMs * 2 ** attempt);
    }
    throw lastError ?? new ProviderError(`${this.name} 请求失败（未知原因）`, undefined, false);
  }

  private parseResponse(raw: string, status: number): CompletionResponse {
    let json: CompatResponse;
    try {
      json = JSON.parse(raw) as CompatResponse;
    } catch {
      throw new ProviderError('响应不是合法 JSON', status, false);
    }
    const choice = json.choices?.[0];
    // E0c 模型亲和：思考型模型可能 content 空、reasoning_content 非空——不崩、透传、可计量
    const reasoningContent =
      typeof choice?.message?.reasoning_content === 'string' ? choice.message.reasoning_content : undefined;
    const text = typeof choice?.message?.content === 'string' ? choice.message.content : '';
    if (typeof choice?.message?.content !== 'string' && !reasoningContent) {
      throw new ProviderError('响应缺少 choices[0].message.content', status, false);
    }
    const logprobs = choice?.logprobs?.content
      ?.map((item) => item.logprob)
      .filter((n): n is number => typeof n === 'number');
    return {
      text,
      ...(logprobs && logprobs.length > 0 ? { logprobs } : {}),
      ...(reasoningContent !== undefined ? { reasoningContent } : {}),
      finishReason: choice?.finish_reason ?? 'unknown',
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
      },
    };
  }

  private parseChunk(data: string): string | undefined {
    try {
      const json = JSON.parse(data) as { choices?: readonly { delta?: { content?: string } }[] };
      const content = json.choices?.[0]?.delta?.content;
      return typeof content === 'string' && content.length > 0 ? content : undefined;
    } catch {
      return undefined; // 忽略心跳/非 JSON 事件
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
