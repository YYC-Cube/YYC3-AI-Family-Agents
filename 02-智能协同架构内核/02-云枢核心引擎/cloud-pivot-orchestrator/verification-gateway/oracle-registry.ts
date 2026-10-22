/**
 * oracle-registry（外部真值源注册表）——verification-gateway 子模块。
 * 职责：登记数据库 / API / 人工确认三类外部真值源，供 ground-truth-checker 路由。
 * 边界：只登记与路由；实际比对归 ground-truth-checker，校准归 confidence-calibrator。
 *
 * TODO(infra): 接入真实 oracle 连接（只读 DB / 外部 API / 人工确认工单）。
 */

import type { OracleSource } from '../../types.js';

/** 外部真值源注册表。 */
export class OracleRegistry {
  private readonly sources = new Map<string, OracleSource>();

  /** 登记一个真值源。 */
  register(source: OracleSource): void {
    // TODO(infra): 校验 kind 合法性并探活
    this.sources.set(source.id, source);
  }

  /** 列出全部真值源。 */
  list(): readonly OracleSource[] {
    return [...this.sources.values()];
  }

  /** 按待校验主张推荐匹配的真值源。 */
  resolve(claim: string): readonly OracleSource[] {
    // TODO(infra): 按 claim 类型路由到匹配的 oracle（DB / API / 人工）
    void claim;
    return this.list();
  }
}
