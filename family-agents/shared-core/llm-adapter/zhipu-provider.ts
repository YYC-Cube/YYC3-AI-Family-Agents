/**
 * 智谱 Provider（shared-core/llm-adapter）—— P1 真实模型接入。
 * 协议：智谱开放平台 v4（OpenAI 兼容），`POST {baseUrl}/chat/completions`。
 * 能力：标准补全、SSE 流式、超时、指数退避重试、错误分类；密钥仅从环境变量读取。
 * 实现：复用 `OpenAiCompatibleClient`，仅提供供应商默认值。
 */

import { OpenAiCompatibleClient } from './openai-compatible-client.js';

/** 智谱运行时选项。 */
export interface ZhipuRuntimeOptions {
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly retryBaseMs?: number;
  readonly fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

/** 智谱 Provider。 */
export class ZhiPuProvider extends OpenAiCompatibleClient {
  constructor(
    apiKeyEnv = 'ZHIPU_API_KEY',
    baseUrl = DEFAULT_BASE_URL,
    options: ZhipuRuntimeOptions = {},
  ) {
    super('zhipu', { apiKeyEnv, baseUrl, ...options });
  }
}
