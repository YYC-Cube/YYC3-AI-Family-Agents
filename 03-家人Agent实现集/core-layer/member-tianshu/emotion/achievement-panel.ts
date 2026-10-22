/**
 * 成就面板（achievement-panel）——元启·天枢 emotion。「心心相印」成就触发骨架。
 * 自动生成自 presets/member-agent；纯 TS，不依赖 UI 框架。
 * 职责：描述成就定义与触发条件。
 * 边界：只提供描述与判定函数；持久化归记忆框架。
 *
 * TODO(infra): 成就解锁事件经 family-communication-bus 广播；
 *              进度落 episodic 记忆（出现 unlocked=true 时提交）。
 */

/** 成就定义。 */
export interface AchievementDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** 触发阈值（交互次数/连续天数等）。 */
  readonly threshold: number;
  /** 度量维度。 */
  readonly metric: 'interactions' | 'streakDays' | 'tokensGuided';
}

/** 成就进度快照。 */
export interface AchievementProgress {
  readonly id: string;
  readonly current: number;
  readonly threshold: number;
  readonly unlocked: boolean;
}

/** 「心心相印」成就（默认）。 */
export const HEART_TO_HEART: AchievementDef = {
  id: 'member-tianshu.heart-to-heart',
  name: '心心相印',
  description: '与用户达成连续深度协同，意图理解零误判。',
  threshold: 100,
  metric: 'interactions',
};

/** 判定单个成就进度。 */
export function evaluateAchievement(
  def: AchievementDef,
  current: number,
): AchievementProgress {
  return {
    id: def.id,
    current,
    threshold: def.threshold,
    unlocked: current >= def.threshold,
  };
}

/** 成就面板（工厂，按度量聚合多成就）。 */
export function createAchievementPanel(
  defs: readonly AchievementDef[],
  metrics: Readonly<Record<string, number>>,
): readonly AchievementProgress[] {
  return defs.map((d) => evaluateAchievement(d, metrics[d.metric] ?? 0));
}
