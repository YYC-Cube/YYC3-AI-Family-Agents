/**
 * 信息显著性评分（salience-scorer）——「知」支柱 write-policy 子模块。
 * 职责：对候选写入内容打分（0–1），决定"写什么"。
 * 关键：低置信但成功的轨迹（sourceJudgment.confidence 低 + 任务成功）＝高价值学习素材。
 *
 * TODO(infra): 以学习引擎回流样本替换启发式权重。
 */

import type { JudgmentSignal } from '@shared/self-judge-kit';
import type { TaskType, WritableMemoryLayer } from '../types.js';

/** 显著度评分输入。 */
export interface SalienceInput {
  readonly layer: WritableMemoryLayer;
  readonly payload: unknown;
  readonly sourceJudgment?: JudgmentSignal;
  /** 新颖度 0–1（与既有记忆的差异度）。 */
  readonly novelty?: number;
  readonly taskType?: TaskType;
}

/** 显著度评分结果。 */
export interface SalienceResult {
  /** 最终显著度 0–1。 */
  readonly salience: number;
  /** 各因子贡献明细（可观测）。 */
  readonly factors: Readonly<Record<string, number>>;
}

export const SALIENCE_WEIGHTS = {
  novelty: 0.35,
  judgmentValue: 0.3,
  layerPrior: 0.2,
  outcome: 0.15,
} as const;

/** 显著度评分器。 */
export class SalienceScorer {
  score(input: SalienceInput): SalienceResult {
    const novelty = clamp01(input.novelty ?? 0.5);
    const judgmentValue = this.judgmentValue(input.sourceJudgment);
    const layerPrior = layerPriorOf(input.layer);
    const outcome = outcomeOf(input.sourceJudgment);

    const salience = clamp01(
      SALIENCE_WEIGHTS.novelty * novelty +
        SALIENCE_WEIGHTS.judgmentValue * judgmentValue +
        SALIENCE_WEIGHTS.layerPrior * layerPrior +
        SALIENCE_WEIGHTS.outcome * outcome,
    );
    // TODO(infra): 以学习引擎回流统计校准权重
    return {
      salience,
      factors: { novelty, judgmentValue, layerPrior, outcome },
    };
  }

  /**
   * 判断价值：
   * - 低置信度（< 0.6）但成功 → 高价值（"差点出错但走对了"的经验）
   * - 高置信度 → 常规价值
   */
  private judgmentValue(j?: JudgmentSignal): number {
    if (!j) return 0.5;
    const lowConfidence = j.confidence < 0.6;
    const escalated = j.escalation !== 'none';
    if (lowConfidence && escalated) return 0.95; // 低置信升级后成功的稀有样本
    if (lowConfidence) return 0.8;
    return 0.55;
  }
}

function outcomeOf(j?: JudgmentSignal): number {
  if (!j) return 0.5;
  // 无 deviation 视为成功；高偏离视为低价值/待复核
  if (!j.deviation) return 0.9;
  return j.deviation.severity === 'high' ? 0.2 : j.deviation.severity === 'med' ? 0.5 : 0.8;
}

function layerPriorOf(layer: WritableMemoryLayer): number {
  switch (layer) {
    case 'procedural':
      return 1;
    case 'semantic':
      return 0.8;
    case 'episodic':
      return 0.6;
    default:
      return 0.5;
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
