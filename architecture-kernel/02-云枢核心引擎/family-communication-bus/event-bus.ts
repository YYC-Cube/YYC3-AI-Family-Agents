/**
 * 家族通信总线（family-communication-bus）—— 事件驱动消息总线。
 * 职责：点对点 / 广播投递、链路追踪（traceId 贯穿）、重试与死信（DLQ）、MCP 适配器。
 * 幂等键 = traceId + agentId + seq（§6.2 幂等与去重）。
 * 边界：家族**内部**事件路由；MCP 为**对外**模型/工具接入标准（适配器关系，非同一物）。
 *
 * 死信语义（第 3 层「总线」自愈，见 07-自愈中心 §5.5）：
 * - 单个处理器失败只影响自身，不阻断同主题其它处理器（故障隔离）；
 * - 最多尝试 `maxAttempts` 次（含首次），带指数退避；
 * - 重试耗尽后写入 DLQ，并回调 `onDeadLetter` 供自愈中心消费；
 * - DLQ 为有界 FIFO（`dlqCapacity`），超限淘汰最旧记录。
 *
 * MCP 适配（P1-T3）：
 * - 适配器只做编解码（McpAdapter），传输由 mcp-adapter/stdio-transport 提供；
 * - 出站：`encodeForMcp` 取编码结果，由调用方写入传输；
 * - 入站：`ingestMcp` 解码后发布；解码失败的事件以合成事件形式进入 DLQ
 *   （topic=`mcp.undecodable`），不向调用方抛出，避免打断传输循环。
 *
 * TODO(infra): 接入消息中间件（Kafka / NATS）。
 */

import type { BusEvent, IdempotencyKey, McpAdapter } from '../types.js';

/** 事件处理器。 */
export type EventHandler = (event: BusEvent) => void | Promise<void>;

/** 死信记录（重试耗尽后的事件快照）。 */
export interface DeadLetter {
  /** 幂等键（traceId:agentId:seq）。 */
  readonly id: string;
  /** 投递目标主题。 */
  readonly topic: string;
  /** 原始事件（供自愈中心重放/审计）。 */
  readonly event: BusEvent;
  /** 实际尝试次数。 */
  readonly attempts: number;
  /** 末次错误摘要。 */
  readonly error: string;
  /** 入队时间（毫秒，由 `now()` 提供）。 */
  readonly at: number;
}

/** 总线运行选项。 */
export interface EventBusOptions {
  /** 最大尝试次数（含首次），默认 3。 */
  readonly maxAttempts?: number;
  /** 首次退避毫秒数；0 表示不等待，后续按 2 的幂递增，默认 0。 */
  readonly retryDelayMs?: number;
  /** DLQ 容量上限，默认 100，超限淘汰最旧。 */
  readonly dlqCapacity?: number;
  /** 时钟注入（测试可确定性断言 `at`），默认 `Date.now`。 */
  readonly now?: () => number;
  /** 死信回调（对接 07-自愈中心的 dead-letter 动作）。 */
  readonly onDeadLetter?: (letter: DeadLetter) => void;
}

/** 家族通信总线。 */
export class EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly seen = new Set<string>();
  private readonly deadQueue: DeadLetter[] = [];
  private readonly mcpAdapters = new Map<string, McpAdapter>();
  private mcpUndecodableSeq = 0;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly dlqCapacity: number;
  private readonly now: () => number;
  private readonly onDeadLetter?: (letter: DeadLetter) => void;

  constructor(options: EventBusOptions = {}) {
    this.maxAttempts = Math.max(1, Math.trunc(options.maxAttempts ?? 3));
    this.retryDelayMs = Math.max(0, options.retryDelayMs ?? 0);
    this.dlqCapacity = Math.max(1, Math.trunc(options.dlqCapacity ?? 100));
    this.now = options.now ?? Date.now;
    this.onDeadLetter = options.onDeadLetter;
  }

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
   * 处理器失败按 `maxAttempts` 重试；耗尽后进入 DLQ，不向发布方抛出。
   * 注意：进入 DLQ 的事件幂等键已被占用，重新 `publish` 同键事件不会重放；
   * 重放由自愈中心通过 `onDeadLetter` 拿到 `letter.event` 后自行决定。
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
      // 快照处理器集合，避免投递期间订阅变更影响本轮
      for (const handler of [...(this.handlers.get(topic) ?? [])]) {
        await this.deliver(id, topic, event, handler);
      }
    }
  }

  /** 死信快照（只读副本，不清空）。 */
  deadLetters(): readonly DeadLetter[] {
    return [...this.deadQueue];
  }

  /** 取出并清空死信（交给自愈中心批处理的典型用法）。 */
  drainDeadLetters(): readonly DeadLetter[] {
    return this.deadQueue.splice(0, this.deadQueue.length);
  }

  /** 注册 MCP 适配器（对外模型/工具接入）。重复 id 视为装配错误。 */
  registerMcpAdapter(adapter: McpAdapter): void {
    if (!adapter.id) throw new Error('MCP 适配器 id 不能为空');
    if (this.mcpAdapters.has(adapter.id)) throw new Error(`MCP 适配器重复注册：${adapter.id}`);
    this.mcpAdapters.set(adapter.id, adapter);
  }

  /** 已注册的适配器 id（装配自检用）。 */
  mcpAdapterIds(): readonly string[] {
    return [...this.mcpAdapters.keys()];
  }

  /** 出站编码：BusEvent → 对外 MCP 消息。未注册或编码失败即抛出。 */
  encodeForMcp(adapterId: string, event: BusEvent): unknown {
    const adapter = this.mcpAdapters.get(adapterId);
    if (!adapter) throw new Error(`未注册的 MCP 适配器：${adapterId}`);
    return adapter.encode(event);
  }

  /**
   * 入站投递：解码 MCP 消息并发布到总线。
   * 解码失败不抛出，而是以合成事件写入 DLQ（topic=`mcp.undecodable`），
   * 保证传输层的消息循环不因单条脏数据中断。
   * @returns 成功时返回解码后的事件；失败返回 undefined。
   */
  async ingestMcp(adapterId: string, raw: unknown): Promise<BusEvent | undefined> {
    const adapter = this.mcpAdapters.get(adapterId);
    if (!adapter) throw new Error(`未注册的 MCP 适配器：${adapterId}`);
    try {
      const event = adapter.decode(raw);
      await this.publish(event);
      return event;
    } catch (error) {
      this.mcpUndecodableSeq += 1;
      const seq = this.mcpUndecodableSeq;
      const at = this.now();
      this.pushDeadLetter({
        id: `mcp:${adapterId}:${seq}`,
        topic: 'mcp.undecodable',
        event: {
          key: { traceId: `mcp-undecodable-${seq}`, agentId: `mcp:${adapterId}`, seq },
          topic: 'mcp.undecodable',
          mode: 'broadcast',
          payload: raw,
          at,
        },
        attempts: 1,
        error: toMessage(error),
        at,
      });
      return undefined;
    }
  }

  /** 单处理器投递：失败重试，耗尽后拉入 DLQ。 */
  private async deliver(
    id: string,
    topic: string,
    event: BusEvent,
    handler: EventHandler,
  ): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        await handler(event);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < this.maxAttempts) {
          await sleep(this.backoffMs(attempt));
        }
      }
    }
    this.pushDeadLetter({
      id,
      topic,
      event,
      attempts: this.maxAttempts,
      error: toMessage(lastError),
      at: this.now(),
    });
  }

  /** 指数退避：retryDelayMs × 2^(attempt-1)；为 0 时不同步等待。 */
  private backoffMs(attempt: number): number {
    return this.retryDelayMs === 0 ? 0 : this.retryDelayMs * 2 ** (attempt - 1);
  }

  /** 入队死信（有界 FIFO）并回调自愈中心。 */
  private pushDeadLetter(letter: DeadLetter): void {
    if (this.deadQueue.length >= this.dlqCapacity) this.deadQueue.shift();
    this.deadQueue.push(letter);
    this.onDeadLetter?.(letter);
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
