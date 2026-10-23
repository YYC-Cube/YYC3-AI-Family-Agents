/**
 * MCP 适配层类型（mcp-adapter/types）—— P1-T3。
 * 职责：定义对外 MCP（JSON-RPC 2.0）消息形状与传输抽象。
 * 边界：MCP = 对外**模型/工具接入标准**；家族**内部**路由归 EventBus。
 *       本目录只做编解码与进程传输，不实现工具语义（tools/list 等）。
 */

/** JSON-RPC 2.0 请求。 */
export interface McpJsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: string | number;
  readonly method: string;
  readonly params?: unknown;
}

/** JSON-RPC 2.0 通知（无 id）。 */
export interface McpJsonRpcNotification {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: unknown;
}

/** JSON-RPC 2.0 错误体。 */
export interface McpJsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

/** JSON-RPC 2.0 响应。 */
export interface McpJsonRpcResponse {
  readonly jsonrpc: '2.0';
  readonly id: string | number;
  readonly result?: unknown;
  readonly error?: McpJsonRpcError;
}

/** 入站消息处理器（已 JSON.parse，未经协议语义校验）。 */
export type McpMessageHandler = (raw: unknown) => void;

/** 传输层抽象（stdio / 未来 Streamable HTTP）。 */
export interface McpTransport {
  readonly kind: string;
  /** 发送一条消息（实现方负责分帧）。 */
  send(message: unknown): void;
  /** 发起请求并等待响应（可选能力）。 */
  request?(method: string, params?: unknown, timeoutMs?: number): Promise<unknown>;
  /** 订阅入站消息，返回取消订阅函数。 */
  onMessage(handler: McpMessageHandler): () => void;
  /** 订阅传输错误（解析失败 / 子进程退出），返回取消订阅函数。 */
  onError(handler: (error: Error) => void): () => void;
  /** 关闭传输并释放资源。 */
  close(): Promise<void>;
}

/** 子进程 stderr 行处理器（诊断信息，非致命）。 */
export type McpStderrHandler = (line: string) => void;

/** stdio 传输选项。 */
export interface StdioTransportOptions {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
  /** 请求超时（毫秒），默认 5000。 */
  readonly requestTimeoutMs?: number;
  /** 单行上限（字节），默认 1 MiB；超限视为协议错误并重置缓冲。 */
  readonly maxLineBytes?: number;
  /** 关闭时等待子进程退出的宽限期（毫秒），默认 1000。 */
  readonly shutdownGraceMs?: number;
}
