/**
 * 家族通信总线（family-communication-bus）—— 事件驱动消息总线。
 * 职责：点对点 / 广播投递、链路追踪（traceId 贯穿）、MCP 适配器。
 * 幂等键 = traceId + agentId + seq（§6.2 幂等与去重）。
 * 边界：家族**内部**事件路由；MCP 为**对外**模型/工具接入标准（适配器关系，非同一物）。
 *
 * TODO(infra): 接入消息中间件（Kafka / NATS）与 MCP 协议适配器。
 */

import type { BusEvent, IdempotencyKey, McpAdapter } from '../types.js';

/** 事件处理器。 */
export type EventHandler = (event: BusEvent) => void | Promise<void>;

/** 家族通信总线。 */
export class EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly seen = new Set<string>();

  /** 构造幂等键（traceId + agentId + seq）。 */
  static idempotencyKey(key: IdempotencyKey): string {
    return `${key.traceId}:${key.agentId}:${key.seq}`;
  }

  /** 订阅主题。 */
  subscribe(topic: string, handler: EventHandler): void {
    // TODO(infra): 支持通配主题与消费组
    const set = this.handlers.get(topic) ?? new Set<EventHandler>();
    set.add(handler);
    this.handlers.set(topic, set);
  }

  /**
   * 发布事件（按 event.mode 点对点 / 广播）。幂等去重，重复事件丢弃。
   * TODO(infra): 链路追踪注入、重试 / 死信（对接 07-自愈中心）。
   */
  async publish(event: BusEvent): Promise<void> {
    const id = EventBus.idempotencyKey(event.key);
    if (this.seen.has(id)) return;
    this.seen.add(id);
    const targets =
      event.mode === 'point-to-point' && event.target
        ? [event.target]
        : [...this.handlers.keys()];
    for (const topic of targets) {
      for (const handler of this.handlers.get(topic) ?? []) await handler(event);
    }
  }

  /** 注册 MCP 适配器（对外模型/工具接入）。 */
  registerMcpAdapter(adapter: McpAdapter): void {
    // TODO(infra): 统一适配外部 MCP 服务的编解码
    void adapter;
  }
}
