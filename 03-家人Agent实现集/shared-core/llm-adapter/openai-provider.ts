/**
 * OpenAI Provider（shared-core/llm-adapter）—— P1 真实模型接入。
 * 协议：OpenAI v1 `/chat/completions`（亦兼容同协议的网关/代理）。
 * 能力：标准补全、SSE 流式、超时、指数退避重试、错误分类；密钥仅从环境变量读取。
 * 实现：复用 `OpenAiCompatibleClient`，仅提供供应商默认值与可选组织/项目头。
 */

import { OpenAiCompatibleClient } from './openai-compatible-client.js';

/** OpenAI 运行时选项。 */
export interface OpenAiRuntimeOptions {
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly retryBaseMs?: number;
  readonly fetchImpl?: typeof fetch;
  /** 组织标识（可选，写入 `OpenAI-Organization`）。 */
  readonly organization?: string;
  /** 项目标识（可选，写入 `OpenAI-Project`）。 */
  readonly project?: string;
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/** OpenAI Provider。 */
export class OpenAiProvider extends OpenAiCompatibleClient {
  constructor(
    apiKeyEnv = 'OPENAI_API_KEY',
    baseUrl = DEFAULT_BASE_URL,
    options: OpenAiRuntimeOptions = {},
  ) {
    const extraHeaders: Record<string, string> = {};
    if (options.organization) extraHeaders['OpenAI-Organization'] = options.organization;
    if (options.project) extraHeaders['OpenAI-Project'] = options.project;
    super('openai', {
      apiKeyEnv,
      baseUrl,
      timeoutMs: options.timeoutMs,
      maxRetries: options.maxRetries,
      retryBaseMs: options.retryBaseMs,
      fetchImpl: options.fetchImpl,
      extraHeaders,
    });
  }
}
