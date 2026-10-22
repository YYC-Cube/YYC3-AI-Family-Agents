/**
 * consistency-metrics（自评-外验一致性指标）——verification-gateway 子模块。
 * 职责：维护 §6.4 Phase B 两大门禁指标的运行时统计：
 *   1. 自评-外验一致率（consistencyRate）：在**自评未升级**（未请求外验）的
 *      判定中，被外部真值证实比例。门禁 > 90%。
 *      （自评已主动升级的样本不计入分母——那是"审慎"，不是"不一致"。）
 *   2. 校准误差（calibrationError）：|校准后置信度 − 真实结果| 的均值。
 *      门禁 ≤ 0.15。
 *   3. 海市蜃楼计数（mirageCount）：自评未升级却被外部驳斥的次数。
 * 边界：只做统计；门禁判定与告警归 orchestrator / 观测平台。
 */

/** 单次闭环裁定统计输入。 */
export interface ConsistencySample {
  /** 自评升级决策（'none' 表示自评声称可自行负责）。 */
  readonly selfEscalation: 'none' | 'cross-validate' | 'human-confirm';
  /** 自评原始置信度。 */
  readonly selfConfidence: number;
  /** 校准后置信度。 */
  readonly calibratedConfidence: number;
  /** 外验是否证实。 */
  readonly verified: boolean;
}

/** 指标快照。 */
export interface ConsistencySnapshot {
  /** 一致率分母样本数（自评未升级样本）。 */
  readonly selfOkSamples: number;
  /** 自评-外验一致率（无样本时为 undefined）。 */
  readonly consistencyRate: number | undefined;
  /** 校准误差均值（无样本时为 undefined）。 */
  readonly calibrationError: number | undefined;
  /** 海市蜃楼命中数。 */
  readonly mirageCount: number;
}

/** 一致性指标追踪器。 */
export class ConsistencyTracker {
  private selfOkTotal = 0;
  private selfOkVerified = 0;
  private calibrationSum = 0;
  private calibrationN = 0;
  private mirages = 0;

  /** 记录一次闭环裁定样本。 */
  record(sample: ConsistencySample): void {
    if (sample.selfEscalation === 'none') {
      this.selfOkTotal += 1;
      if (sample.verified) {
        this.selfOkVerified += 1;
      } else {
        // 自评声称可自行负责，却被外部驳斥 → 典型海市蜃楼形态
        this.mirages += 1;
      }
    }
    const outcome = sample.verified ? 1 : 0;
    this.calibrationSum += Math.abs(sample.calibratedConfidence - outcome);
    this.calibrationN += 1;
  }

  /** 当前指标快照。 */
  snapshot(): ConsistencySnapshot {
    return {
      selfOkSamples: this.selfOkTotal,
      consistencyRate: this.selfOkTotal === 0 ? undefined : this.selfOkVerified / this.selfOkTotal,
      calibrationError: this.calibrationN === 0 ? undefined : this.calibrationSum / this.calibrationN,
      mirageCount: this.mirages,
    };
  }
}
