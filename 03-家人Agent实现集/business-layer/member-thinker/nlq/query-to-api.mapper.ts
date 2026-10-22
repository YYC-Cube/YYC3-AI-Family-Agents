/**
 * 查询 → API 映射（query-to-api.mapper）——语枢·万物 nlq。
 * 自动生成自 presets/member-agent；请补齐 TODO(infra) 与业务逻辑。
 * 职责：把结构化 ParsedQuery 映射为下游家人/服务的显式 API 契约调用。
 * 边界：只做"结构 → API 契约"的映射；不发起真实请求（归 provider/adapter）。
 *
 * TODO(infra): 接入 shared-core 的 RPC 契约注册表（禁止模块间隐式直连）；
 *              映射结果经 family-communication-bus 下发。
 */

import type { ParsedQuery, QueryFilter } from './query-parser.service.js';

/** HTTP 方法。 */
export type HttpMethod = 'GET' | 'POST';

/** API 调用契约（显式、可审计）。 */
export interface ApiCall {
  readonly service: string; // 目标家人/服务编号，如 '010301-02'
  readonly method: HttpMethod;
  readonly path: string; // 相对路径，如 '/analysis/query'
  readonly query: Readonly<Record<string, string>>;
  readonly body?: unknown;
}

/** 映射选项。 */
export interface MapperOptions {
  /** 是否把解析置信度透传给下游（供其二次校验）。 */
  readonly forwardConfidence?: boolean;
}

/** 查询 → API 映射器。 */
export class QueryToApiMapper {
  /** 意图 → 目标服务（编号在 agent.yaml 声明）。 */
  private readonly routeTable: Readonly<Record<string, string>> = {
    analysis: '010301-02',
    prediction: '010301-03',
    recommendation: '010301-04',
    creation: '010301-08',
    chat: '010301-01',
  };

  /** 把解析结果映射为一次 API 调用契约。 */
  map(parsed: ParsedQuery, options: MapperOptions = {}): ApiCall {
    const service = this.routeTable[parsed.intentHint] ?? '010301-05';
    const query: Record<string, string> = {
      entity: parsed.entities.map((e) => e.name).join(','),
      metric: parsed.metrics.join(','),
    };
    if (parsed.timeRange?.from) query.from = parsed.timeRange.from;
    if (parsed.timeRange?.to) query.to = parsed.timeRange.to;
    if (options.forwardConfidence) query.confidence = String(parsed.confidence);

    return {
      service,
      method: 'POST',
      path: `/${parsed.intentHint}/query`,
      query,
      body: { filters: parsed.filters.map(toWireFilter), raw: parsed.raw },
    };
  }
}

/** 过滤条件 → 传输格式。 */
function toWireFilter(f: QueryFilter): Record<string, unknown> {
  return { field: f.field, op: f.op, value: f.value };
}
