/**
 * MCP 服务端协议语义（mcp-adapter/server/protocol）—— P3-MCP + P4-T5。
 * 职责：无状态 JSON-RPC 2.0 方法分派——initialize / ping / tools/list / tools/call。
 * 边界：对齐 MCP 2026-07-28 规范的最小子集；工具目录由部署侧注入（P4-T5：
 *       `scripts/gen-mcp-tools.mjs` 由 manifest 派生 assets/mcp-tools.json），
 *       内核不反向依赖 family-agents / presets（单向依赖：server → types）。
 * 治理：`visible` 过滤未准入工具（tools/list 与 tools/call 同源），
 *       `policy` 在分派前裁决（可接 CapabilityAllowlist / PolicyRegistry）。
 * 红线：零运行时依赖，仅 node 标准 JSON 能力；通知类消息不产生响应行。
 */

import type {
  McpJsonRpcError,
} from '../types.js';

/** 本实现锚定的 MCP 规范版本（2026-07-28：无状态核心 + 可缓存列表）。 */
export const MCP_PROTOCOL_VERSION = '2026-07-28';

/** MCP 工具描述符（tools/list 单项）。 */
export interface McpToolDescriptor {
  /** 工具名：MCP 规范要求 `^[a-zA-Z0-9_-]+$`（家族 id 的 `.` 由部署侧映射为 `__`）。 */
  readonly name: string;
  readonly description: string;
  /** JSON Schema 形状的输入描述。 */
  readonly inputSchema: Record<string, unknown>;
}

/** 服务端自描述信息（initialize 回显）。 */
export interface McpServerInfo {
  readonly name: string;
  readonly version: string;
}

/** tools/call 上下文（策略裁决与分派共用）。 */
export interface McpToolCallContext {
  readonly toolName: string;
  /** 工具入参（缺省 `{}`）。 */
  readonly args: unknown;
  /** 可选链路 / 主体（部署侧经 `params._meta` 注入）。 */
  readonly traceId?: string;
  readonly actor?: string;
}

/** 策略裁决（tools/call 唯一闸门；`admitted=false` 即拒绝）。 */
export interface McpToolPolicyDecision {
  readonly admitted: boolean;
  readonly reason?: string;
}

/** 工具调用策略（可接 CapabilityAllowlist / PolicyRegistry 等治理实现）。 */
export type McpToolPolicy = (ctx: McpToolCallContext) => McpToolPolicyDecision;

/** 工具分派器：仅做路由 / 执行，返回可 JSON 序列化的同步结果。 */
export type McpToolDispatcher = (ctx: McpToolCallContext) => unknown;

/** 服务端选项。 */
export interface McpServerOptions {
  readonly serverInfo: McpServerInfo;
  /** 只读工具目录：构造期校验命名与唯一性（fail-fast）。 */
  readonly tools: readonly McpToolDescriptor[];
  /** 覆盖协议版本（默认 {@link MCP_PROTOCOL_VERSION}）。 */
  readonly protocolVersion?: string;
  /** 可见性过滤（未准入工具不可见：tools/list 与 tools/call 同源过滤）。 */
  readonly visible?: (tool: McpToolDescriptor) => boolean;
  /** 工具调用策略（缺省全放行；拒绝时返回 `isError: true` 的工具结果）。 */
  readonly policy?: McpToolPolicy;
  /** 工具分派（未配置时 tools/call 回 -32603）。 */
  readonly dispatch?: McpToolDispatcher;
}

/** 无状态请求处理器：一行请求 → 一行响应；通知返回 null。 */
export interface McpRequestHandler {
  handle(raw: string): string | null;
}

function jsonError(id: string | number | null, code: number, message: string): string {
  const error: McpJsonRpcError = { code, message };
  return JSON.stringify({ jsonrpc: '2.0', id, error });
}

/**
 * 创建无状态 MCP 请求处理器。
 * 不保留任何跨请求状态：同一输入恒得同一输出（幂等），可水平扩展。
 */
export function createMcpRequestHandler(options: McpServerOptions): McpRequestHandler {
  const seen = new Set<string>();
  for (const tool of options.tools) {
    if (!/^[a-zA-Z0-9_-]+$/.test(tool.name)) throw new Error(`MCP 工具名不合规（^[a-zA-Z0-9_-]+$）：${tool.name}`);
    if (seen.has(tool.name)) throw new Error(`MCP 工具名重复：${tool.name}`);
    seen.add(tool.name);
  }

  // 可见性过滤（未准入工具不可见）——列表与调用共用同一集合，杜绝「列表隐藏但可调用」的泄漏
  const visibleTools = options.tools.filter((tool) => options.visible?.(tool) ?? true);
  const visibleByName = new Map(visibleTools.map((tool) => [tool.name, tool]));
  const toolsResult = {
    tools: visibleTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  };
  const initializeResult = {
    protocolVersion: options.protocolVersion ?? MCP_PROTOCOL_VERSION,
    capabilities: { tools: { listChanged: false } },
    serverInfo: options.serverInfo,
  };

  const toolResult = (text: string, isError: boolean) => ({ content: [{ type: 'text', text }], isError });

  /** tools/call：参数校验 → 可见性 → Policy 裁决 → 分派（同步结果 JSON 化）。 */
  const callTool = (id: string | number, params: unknown): string => {
    if (typeof params !== 'object' || params === null || Array.isArray(params)) {
      return jsonError(id, -32602, 'Invalid params');
    }
    const { name, arguments: rawArgs, _meta: meta } = params as {
      name?: unknown;
      arguments?: unknown;
      _meta?: Record<string, unknown>;
    };
    if (typeof name !== 'string' || name.length === 0) {
      return jsonError(id, -32602, 'Invalid params: missing tool name');
    }
    if (rawArgs !== undefined && (typeof rawArgs !== 'object' || rawArgs === null || Array.isArray(rawArgs))) {
      return jsonError(id, -32602, 'Invalid params: arguments must be an object');
    }
    // 未知 / 未准入工具一律 -32602（不区分，避免泄露被隐藏工具的存在）
    if (!visibleByName.has(name)) return jsonError(id, -32602, `Unknown tool: ${name}`);
    if (!options.dispatch) return jsonError(id, -32603, 'Tool dispatch not configured');

    const ctx: McpToolCallContext = {
      toolName: name,
      args: rawArgs ?? {},
      traceId: typeof meta?.traceId === 'string' ? meta.traceId : undefined,
      actor: typeof meta?.actor === 'string' ? meta.actor : undefined,
    };
    const verdict = options.policy?.(ctx);
    if (verdict && !verdict.admitted) {
      return JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: toolResult(verdict.reason ?? `Policy denied: ${name}`, true),
      });
    }
    try {
      const output = options.dispatch(ctx);
      return JSON.stringify({ jsonrpc: '2.0', id, result: toolResult(JSON.stringify(output ?? null), false) });
    } catch (error) {
      // 工具执行失败按 MCP 语义返回 isError 结果（不炸协议层）
      return JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: toolResult(error instanceof Error ? error.message : String(error), true),
      });
    }
  };

  return {
    handle(raw: string): string | null {
      let msg: unknown;
      try {
        msg = JSON.parse(raw);
      } catch {
        return jsonError(null, -32700, 'Parse error');
      }
      if (typeof msg !== 'object' || msg === null || Array.isArray(msg) || typeof (msg as { method?: unknown }).method !== 'string') {
        return jsonError(null, -32600, 'Invalid Request');
      }
      const { method, id, params } = msg as { method: string; id?: unknown; params?: unknown };
      const isRequest = 'id' in msg && id !== undefined && id !== null;
      const respond = (result: unknown): string | null =>
        isRequest ? JSON.stringify({ jsonrpc: '2.0', id, result }) : null;

      switch (method) {
        case 'initialize':
          return respond(initializeResult);
        case 'ping':
          return respond({});
        case 'tools/list':
          return respond(toolsResult);
        case 'tools/call':
          // 通知类不执行（无 id 的调用无响应通道，避免静默副作用）
          return isRequest ? callTool(id as string | number, params) : null;
        default:
          // 请求类未知方法回 -32601；通知类按 JSON-RPC 规范静默
          return isRequest ? jsonError(id as string | number, -32601, 'Method not found') : null;
      }
    },
  };
}
