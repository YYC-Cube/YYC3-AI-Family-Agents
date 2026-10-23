/**
 * 一致性校验（consistency-checker）——「知」支柱 memory-orchestrator 子模块。
 * 职责：跨层一致性校验（重复 / 冲突 / 孤儿 / 过期），输出 ConsistencyReport。
 * 边界：只检测与上报；自动修复归自愈中心 consistency-repair（§5.5）。
 *
 * TODO(infra): 引入快照比对与增量校验，修复时以快照回滚（RPO=0）。
 */

import type {
  ConsistencyIssue,
  ConsistencyIssueKind,
  ConsistencyReport,
  MemoryLayer,
  MemoryScope,
} from '../types.js';

/** 单层快照（供一致性比对）。 */
export interface LayerSnapshot {
  readonly layer: MemoryLayer;
  readonly records: readonly { readonly id: string }[];
}

/** 一致性校验器。 */
export class ConsistencyChecker {
  /** 对给定层快照做跨层一致性校验。 */
  check(scope: MemoryScope, snapshots: readonly LayerSnapshot[]): ConsistencyReport {
    const issues: ConsistencyIssue[] = [];
    const seen = new Map<string, MemoryLayer>();
    for (const snap of snapshots) {
      for (const rec of snap.records) {
        const prev = seen.get(rec.id);
        if (prev && prev !== snap.layer) {
          issues.push({
            kind: 'duplicate' satisfies ConsistencyIssueKind,
            layer: snap.layer,
            id: rec.id,
            detail: `id ${rec.id} 同时出现在 ${prev} 与 ${snap.layer} 层`,
            severity: 'med',
            repairable: true,
          });
        } else {
          seen.set(rec.id, snap.layer);
        }
      }
    }
    // TODO(infra): 增加 stale（超期未更新）/ orphan（关系悬空）检测
    return {
      scope,
      ok: issues.length === 0,
      checkedAt: Date.now(),
      issues,
      layers: snapshots.map((s) => s.layer),
    };
  }
}
