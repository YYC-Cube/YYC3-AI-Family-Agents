/**
 * 智谱 Provider（shared-core/llm-adapter）—— P1 真实模型接入。
 * 协议：智谱开放平台 v4（OpenAI 兼容），`POST {baseUrl}/chat/completions`。
 * 能力：标准补全、SSE 流式、超时、指数退避重试、错误分类；密钥仅从环境变量读取。
 * 安全：不落盘、不打印、不进入错误信息（错误仅保留状态码与脱敏摘要）。
 */

import type { ChatMessage, CompletionRequest, CompletionResponse } from './types.js';
import { ProviderError } from './types.js';

export type { ChatMessage, CompletionRequest, CompletionResponse } from './types.js';
export { ProviderError } from './types.js';

/** 运行时选项（测试可注入 fetch 与缩短超时）。 */
export interface ZhipuRuntimeOptions {
  /** 超时毫秒，默认 30s。 */
  readonly timeoutMs?: number;
  /** 重试次数（不含首次），默认 2。 */
  readonly maxRetries?: number;
  /** 退避基数毫秒，默认 300（指数：base * 2^attempt）。 */
  readonly retryBaseMs?: number;
  /** 注入 fetch（测试用）。 */
  readonly fetchImpl?: typeof fetch;
}

/** 智谱响应（仅声明使用到的字段）。 */
interface ZhipuResponse {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string };
    readonly finish_reason?: string;
    readonly logprobs?: { readonly content?: readonly { readonly logprob?: number }[] };
  }[];
  readonly usage?: { readonly prompt_tokens?: number; readonly completion_tokens?: number };
}

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

/** 智谱 Provider。 */
export class ZhiPuProvider {
  readonly name = 'zhipu';
  /** 每 K token 成本（占位；按实际计费策略配置）。 */
  readonly costPerKToken = 0;

  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly apiKeyEnv = 'ZHIPU_API_KEY',
    private readonly baseUrl = DEFAULT_BASE_URL,
    options: ZhipuRuntimeOptions = {},
  ) {
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
    if (!body) throw new ProviderError('智谱响应不含流式内容', res.status, false);

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

  private payload(req: CompletionRequest, stream: boolean): Record<string, unknown> {
    return {
      model: req.model,
      messages: req.messages,
      stream,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
      ...(req.logprobs ? { logprobs: true } : {}),
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
          },
          body: JSON.stringify(this.payload(req, stream)),
          signal: controller.signal,
        });
        if (res.ok) return res;

        const detail = (await res.text().catch(() => '')).slice(0, 200);
        const err = new ProviderError(
          `智谱接口返回 ${res.status}${detail ? `：${detail}` : ''}`,
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
            timeout ? `智谱请求超时（>${this.timeoutMs}ms）` : `智谱请求失败：${message}`,
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
    throw lastError ?? new ProviderError('智谱请求失败（未知原因）', undefined, false);
  }

  private parseResponse(raw: string, status: number): CompletionResponse {
    let json: ZhipuResponse;
    try {
      json = JSON.parse(raw) as ZhipuResponse;
    } catch {
      throw new ProviderError('智谱响应不是合法 JSON', status, false);
    }
    const choice = json.choices?.[0];
    const text = choice?.message?.content;
    if (typeof text !== 'string') {
      throw new ProviderError('智谱响应缺少 choices[0].message.content', status, false);
    }
    const logprobs = choice?.logprobs?.content
      ?.map((item) => item.logprob)
      .filter((n): n is number => typeof n === 'number');
    return {
      text,
      ...(logprobs && logprobs.length > 0 ? { logprobs } : {}),
      finishReason: choice?.finish_reason ?? 'unknown',
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
      },
    };
  }

  private parseChunk(data: string): string | undefined {
    try {
      const json = JSON.parse(data) as {
        choices?: readonly { delta?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.delta?.content;
      return typeof content === 'string' && content.length > 0 ? content : undefined;
    } catch {
      return undefined; // 忽略心跳/非 JSON 事件，不中断流
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
