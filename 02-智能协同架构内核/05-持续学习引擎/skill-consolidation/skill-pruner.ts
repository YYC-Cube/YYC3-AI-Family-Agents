/**
 * 技能淘汰（skill-pruner）——「学」支柱 skill-consolidation 子模块。
 * 职责：淘汰久未使用 / 长期低效技能（对接记忆遗忘曲线）。
 * 边界：只给出淘汰候选；实际删除/降权由调用方（skill-versioner + 持久层）执行。
 *
 * TODO(infra): 结合遗忘曲线与业务重要性（禁止淘汰治理/质量关键技能），淘汰入审计。
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

  /** 返回应淘汰的技能 id 列表。 */
  select(skills: readonly SkillDefinition[], now: number = Date.now()): readonly string[] {
    // TODO(infra): 依据 lastUsedAt / useCount 与 policy 计算候选；排除关键技能
    void skills;
    void now;
    void this.policy;
    return [];
  }
}
