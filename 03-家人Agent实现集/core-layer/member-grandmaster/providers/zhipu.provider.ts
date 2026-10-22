/**
 * 智谱 Provider（骨架）——格物·宗师 providers。
 * 自动生成自 presets/member-agent；请补齐 TODO(infra) 与业务逻辑。
 * 职责：对接智谱 GLM 系列，作为 OpenAI 的降级备选（provider_chain: openai → zhipu → ollama）。
 * 边界：只做模型调用与响应整形。
 *
 * TODO(infra): 接入 shared-core/llm-adapter；密钥来自环境变量 ZHIPU_API_KEY。
 */

import type { ChatMessage, CompletionRequest, CompletionResponse } from './openai.provider.js';

/** ZhiPu Provider。 */
export class ZhiPuProvider {
  readonly name = 'zhipu';
  readonly costPerKToken = 0;

  constructor(
    private readonly apiKeyEnv = 'ZHIPU_API_KEY',
    private readonly baseUrl = 'https://open.bigmodel.cn/api/paas/v4',
  ) {}

  /** 是否可用（密钥存在性检查）。 */
  isAvailable(): boolean {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    return Boolean(env?.[this.apiKeyEnv]);
  }

  /** 标准补全（复用 OpenAI 兼容形状）。 */
  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    void req;
    void this.baseUrl;
    // TODO(infra): 智谱 API 调用（OpenAI 兼容协议，含重试）
    throw new Error('ZhiPuProvider.complete 未实现（骨架）');
  }

  /** 流式补全。 */
  async *stream(req: CompletionRequest): AsyncGenerator<string, void, void> {
    void req;
    // TODO(infra): 解析增量流
    throw new Error('ZhiPuProvider.stream 未实现（骨架）');
  }

  /** 消息构造辅助（供上层复用）。 */
  static buildMessages(system: string, history: readonly ChatMessage[]): readonly ChatMessage[] {
    return [{ role: 'system', content: system }, ...history];
  }
}
