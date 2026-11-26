/**
 * 智谱 Provider —— 格物·宗师 providers（转发 shared-core/llm-adapter）。
 * 实现、超时与重试策略集中在 shared-core，避免 8 份重复。
 * 密钥：环境变量 ZHIPU_API_KEY（禁止硬编码）。
 */

export { ZhiPuProvider } from '@shared/llm-adapter/zhipu-provider.js';
export type { ChatMessage, CompletionRequest, CompletionResponse } from '@shared/llm-adapter/types.js';
