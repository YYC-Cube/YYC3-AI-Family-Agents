/**
 * 技能淘汰（skill-pruner）——「学」支柱 skill-consolidation 子模块。
 * 职责：淘汰久未使用 / 长期低效技能（对接记忆遗忘曲线）。
 * 语义（M25 由桩转实）：
 *   - 候选 = 空闲超阈值（now − lastUsedAt > maxIdleMs）**或** 频次过低
 *     （useCount ≤ minUseCount；无 lastUsedAt 视为从未使用）；
 *   - 治理/质量关键技能经 protectedIds 显式豁免（默认空，由部署侧注入）；
 *   - hardDelete 只影响调用方处置（物理删 vs 标记 deprecated），本器只出候选。
 * 边界：只给出淘汰候选；实际删除/降权由调用方（skill-versioner + 持久层）执行。
 */

import type { SkillDefinition } from '../types.js';

/** 淘汰策略参数。 */
export interface PrunePolicy {
  /** 超过该空闲时长（毫秒）进入淘汰候选。 */
  readonly maxIdleMs: number;
  /** 使用频次低于该值进入淘汰候选。 */
  readonly minUseCount: number;
  /** 物理删除（true）或标记 deprecated（false）。默认软删除。 */
  readonly hardDelete: boolean;
  /** 治理/质量关键技能豁免清单（id；默认空，部署侧注入）。 */
  readonly protectedIds?: readonly string[];
}

/** 默认淘汰策略：90 天未使用或使用次数 ≤ 1 进入候选（软删除）。 */
export const DEFAULT_PRUNE_POLICY: PrunePolicy = {
  maxIdleMs: 90 * 24 * 60 * 60 * 1000,
  minUseCount: 1,
  hardDelete: false,
};

/** 技能淘汰器。 */
export class SkillPruner {
  constructor(private readonly policy: PrunePolicy = DEFAULT_PRUNE_POLICY) { }

  /** 返回应淘汰的技能 id 列表（protectedIds 豁免；无 lastUsedAt 视为从未使用）。 */
  select(skills: readonly SkillDefinition[], now: number = Date.now()): readonly string[] {
    const protectedSet = new Set(this.policy.protectedIds ?? []);
    return skills
      .filter((s) => !protectedSet.has(s.id))
      .filter((s) => {
        const idleMs = now - (s.lastUsedAt ?? 0);
        const useCount = s.useCount ?? 0;
        return idleMs > this.policy.maxIdleMs || useCount <= this.policy.minUseCount;
      })
      .map((s) => s.id);
  }
}
