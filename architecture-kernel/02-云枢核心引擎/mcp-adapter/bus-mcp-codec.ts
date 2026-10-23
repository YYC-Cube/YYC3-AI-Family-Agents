/**
 * 总线事件 ↔ MCP 消息编解码（bus-mcp-codec）—— P1-T3。
 * 职责：把内部 BusEvent 编码为 MCP JSON-RPC 通知，并把入站 MCP 消息解码回 BusEvent。
 * 边界：只做形状转换与字段校验；路由、重试、死信归 EventBus。
 *
 * 线上形状（method 可配，默认 `yyc3/event`）：
 *   {"jsonrpc":"2.0","method":"yyc3/event","params":{"key":{...},"topic":"...","mode":"...","target":"...","payload":{},"at":0}}
 */

import type { BusEvent, EventMode, IdempotencyKey, McpAdapter } from '../types.js';

/** 编解码选项。 */
export interface BusMcpCodecOptions {
  /** 适配器标识（与 EventBus.registerMcpAdapter 的 key 一致），默认 `bus`。 */
  readonly id?: string;
  /** 事件方法名，默认 `yyc3/event`。 */
  readonly method?: string;
}

const MODES: readonly EventMode[] = ['point-to-point', 'broadcast'];

/** 入站参数形状。 */
interface EventParams {
  readonly key: IdempotencyKey;
  readonly topic: string;
  readonly mode: EventMode;
  readonly target?: string;
  readonly payload: unknown;
  readonly at: number;
}

/**
 * 总线事件 MCP 编解码器。
 * encode 失败抛出（调用方决定是否阻断）；decode 失败抛出（EventBus 统一入 DLQ）。
 */
export class BusMcpCodec implements McpAdapter {
  readonly id: string;
  private readonly method: string;

  constructor(options: BusMcpCodecOptions = {}) {
    this.id = options.id ?? 'bus';
    this.method = options.method ?? 'yyc3/event';
  }

  /** BusEvent → MCP JSON-RPC 通知。 */
  encode(event: BusEvent): unknown {
    if (!event.topic) throw new Error('BusEvent.topic 不能为空');
    if (!MODES.includes(event.mode)) throw new Error(`不支持的投递模式：${String(event.mode)}`);
    if (event.mode === 'point-to-point' && !event.target) {
      throw new Error('点对点事件缺少 target');
    }
    const params: EventParams = {
      key: event.key,
      topic: event.topic,
      mode: event.mode,
      ...(event.target ? { target: event.target } : {}),
      payload: event.payload,
      at: event.at,
    };
    return { jsonrpc: '2.0', method: this.method, params };
  }

  /** MCP JSON-RPC 通知 → BusEvent。 */
  decode(raw: unknown): BusEvent {
    if (!isRecord(raw)) throw new Error('MCP 消息必须是对象');
    if (raw.jsonrpc !== '2.0') throw new Error('不是 JSON-RPC 2.0 消息');
    if (raw.method !== this.method) {
      throw new Error(`不支持的方法：${String(raw.method)}（期望 ${this.method}）`);
    }
    const params = raw.params;
    if (!isRecord(params)) throw new Error('MCP 消息缺少 params');

    const key = params.key;
    if (!isRecord(key)) throw new Error('params.key 缺失');
    if (typeof key.traceId !== 'string' || key.traceId === '') throw new Error('params.key.traceId 非法');
    if (typeof key.agentId !== 'string' || key.agentId === '') throw new Error('params.key.agentId 非法');
    if (!Number.isInteger(key.seq) || (key.seq as number) < 0) throw new Error('params.key.seq 非法');

    if (typeof params.topic !== 'string' || params.topic === '') throw new Error('params.topic 非法');
    if (!MODES.includes(params.mode as EventMode)) throw new Error(`params.mode 非法：${String(params.mode)}`);
    if (params.mode === 'point-to-point' && (typeof params.target !== 'string' || params.target === '')) {
      throw new Error('点对点消息缺少 params.target');
    }
    if (!('payload' in params)) throw new Error('params.payload 缺失');
    if (typeof params.at !== 'number' || !Number.isFinite(params.at)) throw new Error('params.at 非法');

    return {
      key: { traceId: key.traceId, agentId: key.agentId, seq: key.seq as number },
      topic: params.topic,
      mode: params.mode as EventMode,
      ...(typeof params.target === 'string' && params.target !== '' ? { target: params.target } : {}),
      payload: params.payload,
      at: params.at,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
