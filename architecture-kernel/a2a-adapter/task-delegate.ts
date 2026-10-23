/**
 * A2A 适配层 · 任务委托（task-delegate · P2-T2）—— 「治」支柱生态外挂。
 * 职责：JSON-RPC 2.0 委托请求构造 + 结果归一；失败（超时 / 非法响应 / 上游 error）
 *       **不向委托方抛出**，归一为 DeadLetter 入有界 FIFO（同构 EventBus DLQ 语义），
 *       并经 `onDeadLetter` 回调供自愈中心消费。
 * 边界：**纯内存 stub，零网络**——transport 由注入提供（生产装配 HTTP，测试注入 fake）；
 *       traceId 贯穿（对齐 P1-T3：「MCP/A2A 调用携带同一 traceId 并可查询」）。
 * 红线：零运行时依赖；不 import family-agents；不真正发起 IO。
 */

import type { A2aAgentCard } from './card-discovery.js';

/** 委托请求（调用方语义）。 */
export interface DelegateRequest {
  /** 目标能力（manifest 技能 id，如 shared.a2a-delegate 的对端能力）。 */
  readonly skillId: string;
  /** 任务输入（结构化载荷）。 */
  readonly input: Readonly<Record<string, unknown>>;
  /** 链路追踪 id（贯穿到外部调用链）。 */
  readonly traceId: string;
}

/** 归一结果（委托方只认这一种形态）。 */
export interface DelegateResult {
  readonly ok: boolean;
  /** 目标 card slug（ok=true 时存在）。 */
  readonly slug?: string;
  /** 归一任务句柄（ok=true 时存在）。 */
  readonly task?: { readonly taskId: string; readonly state: string };
  /** 失败原因（ok=false 时存在）。 */
  readonly reason?: string;
  readonly traceId: string;
}

/** 死信（同构 EventBus DeadLetter：重试/传输耗尽的任务归档）。 */
export interface A2aDeadLetter {
  readonly topic: 'a2a.delegate.failed';
  readonly reason: string;
  readonly ts: number;
  readonly request: DelegateRequest;
  /** 目标 slug（可达 card 时存在）。 */
  readonly slug?: string;
}

/**
 * 传输接口（注入式，零网络 stub）。
 * 生产：HTTP POST JSON-RPC；测试：注入 fake（成功 / 抛超时 / 返回非法体）。
 */
export interface A2aTransport {
  /** 发送 JSON-RPC 请求体，返回响应体；失败可抛错（如超时）。 */
  send(url: string, body: string): Promise<string>;
}

/** 委托客户端依赖（可注入）。 */
export interface DelegateClientDeps {
  /** card 注册表（findByCapability 定位目标）。 */
  readonly directory: import('./card-discovery.js').CardDirectory;
  /** 传输实现（注入式）。 */
  readonly transport: A2aTransport;
  /** 单调时钟（可注入，测试冻结）。 */
  readonly now?: () => number;
  /** 请求 id 生成（默认递增）。 */
  readonly nextId?: () => string;
  /** 死信回调（装配层可接 EventBus / 自愈中心）。 */
  readonly onDeadLetter?: (letter: A2aDeadLetter) => void;
  /** DLQ 容量上限，默认 100，超限淘汰最旧。 */
  readonly dlqCapacity?: number;
}

/** A2A 1.0 标准委托 method（message/send → task）。 */
export const A2A_METHOD = 'message/send';

/** 任务委托客户端（统一拦截后的外呼出口）。 */
export class DelegateClient {
  private readonly deadQueue: A2aDeadLetter[] = [];
  private readonly dlqCapacity: number;
  private seq = 0;

  constructor(private readonly deps: DelegateClientDeps) {
    this.dlqCapacity = Math.max(1, Math.trunc(deps.dlqCapacity ?? 100));
  }

  /** 死信快照（自愈中心消费）。 */
  deadLetters(): readonly A2aDeadLetter[] {
    return [...this.deadQueue];
  }

  /**
   * 委托一次任务：能力定位 → JSON-RPC 构造 → 传输 → 归一。
   * 任何失败路径都归一为 `{ok:false}` 并入 DLQ，不向委托方抛出。
   */
  async delegate(req: DelegateRequest): Promise<DelegateResult> {
    const now = this.deps.now ?? Date.now;
    const card = this.deps.directory.findByCapability(req.skillId);
    if (!card) {
      return this.dead(req, `无 card 声明能力 ${req.skillId}（card 目录 ${this.deps.directory.size} 张）`, now());
    }
    const slug = card.url.replace(/\/+$/, '').split('/').pop() ?? '';
    let raw: string;
    try {
      raw = await this.deps.transport.send(
        card.url,
        JSON.stringify({
          jsonrpc: '2.0',
          id: this.deps.nextId ? this.deps.nextId() : `a2a-${++this.seq}`,
          method: A2A_METHOD,
          params: { skillId: req.skillId, input: req.input, traceId: req.traceId },
        }),
      );
    } catch (error) {
      return this.dead(req, `传输失败（超时/网络）：${error instanceof Error ? error.message : String(error)}`, now(), slug);
    }

    const parsed = this.normalize(raw, req.traceId);
    if (!parsed.ok) {
      return this.dead(req, parsed.reason ?? '非法响应', now(), slug);
    }
    return { ok: true, slug, task: parsed.task, traceId: req.traceId };
  }

  /** 响应归一：JSON-RPC result → 任务句柄；error / 非法体 → 失败。 */
  private normalize(raw: string, traceId: string): { ok: true; task: { taskId: string; state: string } } | { ok: false; reason: string } {
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return { ok: false, reason: '非法响应：非 JSON 体' };
    }
    if (!body || typeof body !== 'object') return { ok: false, reason: '非法响应：非对象体' };
    const record = body as Record<string, unknown>;
    if (record.error) {
      const err = record.error as Record<string, unknown>;
      return { ok: false, reason: `上游错误 ${String(err.code ?? '?')}：${String(err.message ?? '')}` };
    }
    const result = (record.result ?? record) as Record<string, unknown>;
    const taskId = result.taskId ?? result.id;
    const state = result.state ?? result.status;
    if (typeof taskId !== 'string' || taskId.length === 0) return { ok: false, reason: '非法响应：缺任务 id' };
    if (typeof state !== 'string' || state.length === 0) return { ok: false, reason: '非法响应：缺任务状态' };
    return { ok: true, task: { taskId, state } };
  }

  /** 失败归档：入有界 DLQ（超限淘汰最旧）+ 回调，不抛出。 */
  private dead(req: DelegateRequest, reason: string, ts: number, slug?: string): DelegateResult {
    const letter: A2aDeadLetter = { topic: 'a2a.delegate.failed', reason, ts, request: req, ...(slug ? { slug } : {}) };
    if (this.deadQueue.length >= this.dlqCapacity) this.deadQueue.shift();
    this.deadQueue.push(letter);
    this.deps.onDeadLetter?.(letter);
    return { ok: false, ...(slug ? { slug } : {}), reason, traceId: req.traceId };
  }
}
