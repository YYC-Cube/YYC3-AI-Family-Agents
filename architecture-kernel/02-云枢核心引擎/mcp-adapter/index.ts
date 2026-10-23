/**
 * MCP 适配层入口（mcp-adapter/index）—— P1-T3。
 * 职责：导出编解码器、stdio 传输与「传输 ↔ 总线」绑定器。
 * 边界：MCP 为对外接入标准；内部路由与死信归 EventBus。
 */

import type { BusEvent, McpAdapter } from '../types.js';
import type { EventBus } from '../family-communication-bus/event-bus.js';
import type { McpTransport } from './types.js';

export type {
  McpJsonRpcRequest,
  McpJsonRpcNotification,
  McpJsonRpcResponse,
  McpJsonRpcError,
  McpMessageHandler,
  McpStderrHandler,
  McpTransport,
  StdioTransportOptions,
} from './types.js';
export { BusMcpCodec } from './bus-mcp-codec.js';
export type { BusMcpCodecOptions } from './bus-mcp-codec.js';
export { StdioMcpTransport } from './stdio-transport.js';
export * from './server/index.js';

/** 绑定选项。 */
export interface McpBindingOptions {
  readonly bus: EventBus;
  readonly adapter: McpAdapter;
  readonly transport: McpTransport;
}

/** 绑定句柄。 */
export interface McpBinding {
  /** 把内部事件编码后发往对端。 */
  send(event: BusEvent): void;
  /** 解绑入站监听并关闭传输。 */
  close(): Promise<void>;
}

/**
 * 绑定「传输 ↔ 总线」：入站消息交给 `bus.ingestMcp`（解码失败入 DLQ），
 * 出站事件经 `adapter.encode` 后写入传输。单向依赖：适配层 → 总线。
 */
export function bindMcpTransport(options: McpBindingOptions): McpBinding {
  const { bus, adapter, transport } = options;
  const unsubscribe = transport.onMessage((raw) => {
    // 解码失败与处理器失败均由总线内部消化（DLQ），此处不向事件循环抛出
    void bus.ingestMcp(adapter.id, raw);
  });

  return {
    send(event: BusEvent): void {
      transport.send(adapter.encode(event));
    },
    async close(): Promise<void> {
      unsubscribe();
      await transport.close();
    },
  };
}
