/**
 * OpenAI Provider —— 就绪·域包执行员 providers（转发 shared-core/llm-adapter）。
 * 类型与实现集中在 shared-core，避免 8 份重复。
 * 密钥：环境变量 OPENAI_API_KEY（禁止硬编码）。
 */

export { OpenAiProvider } from '@shared/llm-adapter/openai-provider.js';
export type { ChatMessage, CompletionRequest, CompletionResponse } from '@shared/llm-adapter/types.js';
