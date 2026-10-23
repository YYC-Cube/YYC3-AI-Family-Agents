/**
 * 合规审计（compliance-audit）——「治」支柱子模块。
 * 职责：合规检查 + **不可篡改审计链**（append-only，链式哈希防篡改）。
 * 边界：只记录与校验；合规判定策略化归 security / quality-governance。
 *
 * v2.5.0（Phase D）转实——FNV-1a 链式哈希：
 *   - hash = FNV-1a(content ∥ prevHash)：任何一条被篡改，其 hash 重算不符且后续 prevHash 断链；
 *   - verify() 重算全链逐环校验，断链即 false（防篡改可检测）。
 * TODO(infra): 落 WORM / 区块链存证存储；提供审计查询分页接口（当前 list 全量内存）。
 */

import type { AuditRecord, PolicyDecision, ResourceRequest } from '../types.js';

/** FNV-1a 32 位摘要（确定性、跨平台一致；桩级防篡改足够，生产可换 SHA-256）。 */
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 审计哈希原像（append 与 verify 共用同一编码，保证可重算）。 */
function hashPayload(
  parts: Pick<AuditRecord, 'id' | 'ts' | 'traceId' | 'actor' | 'action' | 'resource' | 'decision' | 'prevHash'>,
): string {
  return fnv1a(
    JSON.stringify({
      id: parts.id,
      ts: parts.ts,
      traceId: parts.traceId,
      actor: parts.actor,
      action: parts.action,
      resource: parts.resource,
      decision: parts.decision,
      prevHash: parts.prevHash,
    }),
  );
}

/** 合规审计链。 */
export class ComplianceAudit {
  private readonly chain: AuditRecord[] = [];

  /** 追加审计记录（链式哈希，篡改即断链）。 */
  append(req: ResourceRequest, decision: PolicyDecision): AuditRecord {
    const prevHash = this.chain.length > 0 ? this.chain[this.chain.length - 1]!.hash : 'GENESIS';
    const record: AuditRecord = {
      id: `audit-${this.chain.length + 1}`,
      ts: Date.now(),
      traceId: req.traceId,
      actor: req.actor,
      action: req.action,
      resource: req.resource,
      decision,
      hash: 'PENDING',
      prevHash,
    };
    // hash 覆盖完整原像（含 prevHash），与 verify() 重算逻辑严格一致
    const withHash: AuditRecord = {
      ...record,
      hash: hashPayload({
        id: record.id,
        ts: record.ts,
        traceId: record.traceId,
        actor: record.actor,
        action: record.action,
        resource: record.resource,
        decision: record.decision,
        prevHash: record.prevHash,
      }),
    };
    this.chain.push(withHash);
    return withHash;
  }

  /** 校验链完整性：重算每条 hash 并逐环校验 prevHash，断链即 false。 */
  verify(): boolean {
    let prev = 'GENESIS';
    for (const r of this.chain) {
      if (r.prevHash !== prev) return false;
      const expected = hashPayload(r);
      if (r.hash !== expected) return false;
      prev = r.hash;
    }
    return true;
  }

  list(): readonly AuditRecord[] {
    return this.chain;
  }
}
