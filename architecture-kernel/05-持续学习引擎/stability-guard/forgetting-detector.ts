/**
 * 遗忘/退化检测（forgetting-detector）——「学」支柱 stability-guard 子模块。
 * 职责：检测新学习是否导致**既有能力退化**（「稳定性—可塑性」守门人）。
 * 边界：只检测退化；回归归 regression-tester，回滚归 rollback-controller。
 *
 * TODO(infra): 基于基线技能性能快照比对，引入显著性检验以避免噪声误判。
 */

/** 能力基线（历史性能快照）。 */
export interface CapabilityBaseline {
  readonly skillId: string;
  /** 历史通过率 0–1。 */
  readonly passRate: number;
  readonly recordedAt: number;
}

/** 退化报告。 */
export interface DegradationReport {
  readonly skillId: string;
  readonly before: number;
  readonly after: number;
  /** 退化幅度（before - after）。 */
  readonly delta: number;
  readonly degraded: boolean;
}

/** 退化检测器。 */
export class ForgettingDetector {
  /** maxDecay：允许的退化幅度上限，超过即判定退化。 */
  constructor(private readonly maxDecay = 0.05) {}

  detect(baseline: CapabilityBaseline, currentPassRate: number): DegradationReport {
    // TODO(infra): 引入显著性检验；阈值可按技能关键度自适应
    const delta = baseline.passRate - currentPassRate;
    return {
      skillId: baseline.skillId,
      before: baseline.passRate,
      after: currentPassRate,
      delta,
      degraded: delta > this.maxDecay,
    };
  }
}
