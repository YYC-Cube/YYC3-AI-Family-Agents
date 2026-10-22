/**
 * 学习回滚（rollback-controller）——「学」支柱 stability-guard 子模块。
 * 职责：学习失败 / 引发退化时，回滚至**上一技能版本**（对接 §5.5 自愈中心学习回滚）。
 * 边界：只决策与触发；实际版本回退由 07-自愈中心 rollback-controller 执行。
 *
 * v2.4.0（Phase C）实装：委托 SkillVersioner 做状态翻转
 *   （当前最高 active → rolled-back，前一 active → 恢复），
 *   返回翻转后历史 + 恢复版本，供 pipeline 原子替换技能库。
 * TODO(infra): 委托 07-自愈中心执行落盘回滚，并冻结相关学习任务（status='rolled-back'）。
 */

import type { SkillDefinition } from '../types.js';
import { SkillVersioner, type RollbackOutcome } from '../skill-consolidation/skill-versioner.js';

/** 学习回滚控制器。 */
export class LearningRollbackController {
  private readonly versioner = new SkillVersioner();

  /** 回滚指定技能：返回翻转后的完整历史与恢复的版本（无可回滚时 restored 为 undefined）。 */
  rollback(history: readonly SkillDefinition[]): RollbackOutcome {
    return this.versioner.rollback(history);
  }
}

export type { RollbackOutcome };
