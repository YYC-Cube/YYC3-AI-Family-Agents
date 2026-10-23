/**
 * ============================================================
 * YYC³ AI Family — 自我判断套件（「自」支柱）统一入口。
 * ------------------------------------------------------------
 * 组合四大组件：confidence-scorer / assumption-tracker /
 *              deviation-detector / escalation-policy。
 *
 * ⚠️ 红线（醒目）：自我判断**不得脱离外部世界状态**，
 *    必须与 verification-gateway.ground-truth-checker 联合校准，
 *    否则低置信度自评会被误当作"已成功"，酿成「进展海市蜃楼」。
 * ============================================================
 */

import { AssumptionTracker, type TrackedAssumption } from './assumption-tracker.js';
import { ConfidenceScorer, type ConfidenceResult } from './confidence-scorer.js';
import { DeviationDetector } from './deviation-detector.js';
import { EscalationPolicy } from './escalation-policy.js';
import {
  DEFAULT_JUDGMENT_CONFIG,
  type JudgmentConfig,
  type JudgmentInput,
  type JudgmentSignal,
  type DeviationReport,
} from './types.js';

export * from './types.js';
export { ConfidenceScorer } from './confidence-scorer.js';
export { AssumptionTracker } from './assumption-tracker.js';
export { DeviationDetector, DEFAULT_DEVIATION_THRESHOLDS } from './deviation-detector.js';
export { EscalationPolicy } from './escalation-policy.js';
export type { ConfidenceInput, ConfidenceResult } from './confidence-scorer.js';
export type { TrackedAssumption } from './assumption-tracker.js';
export type { DeviationThresholds } from './deviation-detector.js';

/** SelfJudge 构造选项。 */
export interface SelfJudgeOptions {
  config?: Partial<JudgmentConfig>;
  /** 置信度评分器选项（温度缩放等）。 */
  scorer?: { temperature?: number; maxAlternatives?: number };
}

/**
 * 自我判断器（组合四大组件）。
 * 暴露 `judge(input): JudgmentSignal`：一次调用产出完整结构化信号。
 */
export class SelfJudge {
  private readonly scorer: ConfidenceScorer;
  private readonly tracker: AssumptionTracker;
  private readonly detector: DeviationDetector;
  private readonly policy: EscalationPolicy;

  constructor(options: SelfJudgeOptions = {}) {
    const config: JudgmentConfig = { ...DEFAULT_JUDGMENT_CONFIG, ...options.config };
    this.scorer = new ConfidenceScorer(options.scorer);
    this.tracker = new AssumptionTracker();
    this.detector = new DeviationDetector();
    this.policy = new EscalationPolicy(config);
  }

  /** 产出自我判断信号。 */
  judge(input: JudgmentInput): JudgmentSignal {
    const ts = Date.now();

    // 1) 显式登记隐式假设
    this.tracker.recordAll(input.assumptions ?? [], ts);

    // 2) 置信度评分（结构化）
    const scored: ConfidenceResult = this.scorer.score({
      agent: input.agent,
      taskType: input.taskType,
      candidates: input.candidates,
      uncertaintySources: input.uncertaintySources,
    });

    // 3) 行为偏离检测
    const deviation: DeviationReport | undefined =
      input.actualBehavior && input.expectedPattern
        ? this.detector.detect(input.actualBehavior, input.expectedPattern)
        : undefined;

    // 4) 升级决策（安全护栏）
    const decision = this.policy.decide({ confidence: scored.confidence, deviation });

    // 5) 组装信号：异常时优先暴露高风险假设
    const onAnomaly = decision.escalation !== 'none';
    const exposedAssumptions: readonly TrackedAssumption[] = this.tracker.relevant(onAnomaly);

    // TODO(infra): 与 verification-gateway.ground-truth-checker 联合校准后再返回
    return {
      agent: input.agent,
      confidence: scored.confidence,
      uncertaintySources: scored.uncertaintySources,
      alternativeHypotheses: scored.alternativeHypotheses,
      assumptions: exposedAssumptions.map((a) => ({
        statement: a.statement,
        basis: a.basis,
        riskIfWrong: a.riskIfWrong,
      })),
      deviation,
      escalation: decision.escalation,
    };
  }

  /** 暴露假设登记器（供异常归因）。 */
  get assumptions(): AssumptionTracker {
    return this.tracker;
  }
}
