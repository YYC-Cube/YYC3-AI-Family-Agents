/**
 * 结果标注（outcome-labeler）——「学」支柱 experience-reflow 子模块。
 * 职责：**不依赖人工标注**，借助既有信号为轨迹标注 success / failure / partial：
 *   · 宗师质量判定通过/不通过 ＝ 可靠标签；
 *   · 千行意图分类正确性 ＝ 后续对话连贯性间接验证；
 *   · 守护拦截误报 ＝ 人工反馈校准（少量）。
 * 边界：只标注；提炼归 pattern-extractor，回归归 stability-guard。
 *
 * TODO(infra): 对接格物·宗师质量判定、守护反馈通道，形成多信号融合标注与阈值校准。
 */

import type { JudgmentSignal } from '@shared/self-judge-kit';
import type { OutcomeLabel, TaskTrajectory } from '../types.js';

/** 标注信号（来自既有能力，全部可选）。 */
export interface LabelSignal {
  /** 宗师质量判定：goldenPass（最可靠的标签来源）。 */
  readonly goldenPass?: boolean;
  /** 对话连贯性间接验证：coherenceOk。 */
  readonly coherenceOk?: boolean;
  /** 守护误报：guardianFalsePositive。 */
  readonly guardianFalsePositive?: boolean;
}

/** 标注结果。 */
export interface LabeledTrajectory {
  readonly trajectory: TaskTrajectory;
  readonly label: OutcomeLabel;
  /** 标注依据（可解释，便于审计）。 */
  readonly rationale: string;
}

/** 结果标注器。 */
export class OutcomeLabeler {
  /** 低置信阈值：低于此值且链路成功 → 高价值学习素材（§5.1）。 */
  constructor(private readonly tauLow = 0.6) { }

  label(trajectory: TaskTrajectory, signal: LabelSignal = {}): LabeledTrajectory {
    // TODO(infra): 多信号加权融合 + 阈值校准；守护误报触发人工反馈校准
    const judgment: JudgmentSignal | undefined = trajectory.judgment;

    // 1) 宗师质量判定为最可靠标签来源
    if (signal.goldenPass === false) {
      return { trajectory, label: 'failure', rationale: '宗师质量判定未通过（可靠负标签）' };
    }
    if (signal.goldenPass === true) {
      return { trajectory, label: 'success', rationale: '宗师质量判定通过（可靠正标签）' };
    }

    // 2) 无质量信号时退化为链路完成度判定
    if (!trajectory.completed) {
      return { trajectory, label: 'failure', rationale: '链路未正常结束' };
    }

    // 3) 低置信但成功 → 高价值学习素材，标记为 partial 待回归
    if (judgment !== undefined && judgment.confidence < this.tauLow) {
      return { trajectory, label: 'partial', rationale: '链路成功但自评低置信，需回归验证' };
    }

    return { trajectory, label: 'success', rationale: '链路成功且自评置信正常' };
  }
}
