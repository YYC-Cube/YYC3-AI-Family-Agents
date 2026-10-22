/**
 * verification-gateway（自评-外验闭环门面）——Phase B 最小闭环。
 * 流程（§5.2 / §5.6）：
 *   self-judge 信号 → ground-truth-checker 真值比对
 *   →（自评升级或真值未证实时）cross-validator 交叉验证
 *   → 合成有效裁定 → confidence-calibrator 校准
 *   → ConsistencyTracker 记录一致率/校准误差/海市蜃楼。
 *
 * ⚠️ 红线：外验未证实 → finalEscalation 强制 human-confirm，
 *    绝不允许低置信自评（或自评过高被驳）直接流往下游。
 */

import type { JudgmentSignal } from '@shared/self-judge-kit';
import type { VerificationRequest, VerificationResult } from '../../types.js';
import { ConfidenceCalibrator, type CalibrationResult } from './confidence-calibrator.js';
import { ConsistencyTracker } from './consistency-metrics.js';
import { CrossValidator } from './cross-validator.js';
import { GroundTruthChecker } from './ground-truth-checker.js';

/** 一次闭环裁定的完整记录（可审计）。 */
export interface AdjudicationRecord {
  readonly traceId: string;
  readonly agent: string;
  /** 原始自评信号。 */
  readonly self: JudgmentSignal;
  /** 真值校验结果。 */
  readonly groundTruth: VerificationResult;
  /** 交叉验证结果（未触发则 undefined）。 */
  readonly cross?: VerificationResult;
  /** 合成后的有效裁定（真值 ∧ 交叉）。 */
  readonly effective: VerificationResult;
  /** 校准结果。 */
  readonly calibration: CalibrationResult;
  /** 最终置信度 = 校准后置信度。 */
  readonly finalConfidence: number;
  /** 最终升级决策。 */
  readonly finalEscalation: 'none' | 'cross-validate' | 'human-confirm';
  /** 海市蜃楼嫌疑：自评未升级却被真值驳斥。 */
  readonly mirageSuspected: boolean;
}

/** 闭环门面构造依赖（均可注入替换，缺省自建）。 */
export interface VerificationGatewayOptions {
  readonly groundTruth?: GroundTruthChecker;
  readonly crossValidator?: CrossValidator;
  readonly calibrator?: ConfidenceCalibrator;
  readonly tracker?: ConsistencyTracker;
}

/** 自评-外验闭环网关。 */
export class VerificationGateway {
  private readonly groundTruth: GroundTruthChecker;
  private readonly crossValidator: CrossValidator;
  private readonly calibrator: ConfidenceCalibrator;
  private readonly tracker: ConsistencyTracker;

  constructor(options: VerificationGatewayOptions = {}) {
    this.groundTruth = options.groundTruth ?? new GroundTruthChecker();
    this.crossValidator = options.crossValidator ?? new CrossValidator();
    this.calibrator = options.calibrator ?? new ConfidenceCalibrator();
    this.tracker = options.tracker ?? new ConsistencyTracker();
  }

  /** 暴露指标追踪器（供观测平台拉取快照）。 */
  get metrics(): ConsistencyTracker {
    return this.tracker;
  }

  /** 暴露子组件（供部署侧注册探针/复核人）。 */
  get oracles(): GroundTruthChecker {
    return this.groundTruth;
  }

  get reviewers(): CrossValidator {
    return this.crossValidator;
  }

  /**
   * 裁定一次自评信号（Phase B 闭环主入口）。
   * @param signal 自评信号（由各位家人 self-judge 模块产出）
   * @param request 待校验主张（如 "intent:analysis"、"quality:passed"）
   */
  async adjudicate(signal: JudgmentSignal, request: VerificationRequest): Promise<AdjudicationRecord> {
    // 1) 真值比对（世界状态优先于任何自评）
    const groundTruth = await this.groundTruth.check(request);

    // 2) 交叉验证：自评请求升级 或 真值未证实时触发
    let cross: VerificationResult | undefined;
    if (signal.escalation === 'cross-validate' || !groundTruth.verified) {
      cross = await this.crossValidator.crossValidate({ request, signal });
    }

    // 3) 合成有效裁定：真值与交叉验证必须同时支持
    const effective = merge(groundTruth, cross);

    // 4) 校准
    const calibration = this.calibrator.calibrate(signal, effective);

    // 5) 最终升级决策（红线：外验未证实 → 强制 human-confirm）
    const mirageSuspected = signal.escalation === 'none' && !effective.verified;
    const finalEscalation =
      signal.escalation === 'human-confirm' || !effective.verified
        ? 'human-confirm'
        : signal.escalation;

    // 6) 指标记录
    this.tracker.record({
      selfEscalation: signal.escalation,
      selfConfidence: signal.confidence,
      calibratedConfidence: calibration.confidence,
      verified: effective.verified,
    });

    return {
      traceId: request.traceId,
      agent: signal.agent,
      self: signal,
      groundTruth,
      cross,
      effective,
      calibration,
      finalConfidence: calibration.confidence,
      finalEscalation,
      mirageSuspected,
    };
  }
}

/** 合成真值与交叉验证：两者都须支持；置信度取保守加权。 */
function merge(gt: VerificationResult, cross?: VerificationResult): VerificationResult {
  if (!cross) return gt;
  const verified = gt.verified && cross.verified;
  // 保守合成：裁定置信 = min(gt.vConf, cross.vConf)；驳斥方优先表达
  const confidence = verified ? Math.min(gt.confidence, cross.confidence) : Math.max(gt.confidence, cross.confidence);
  return {
    traceId: gt.traceId,
    verified,
    sources: [...gt.sources, ...cross.sources],
    confidence,
    detail: `真值[${gt.verified}] ∧ 交叉[${cross.verified}]：${verified ? '双通道支持' : '存在未支持通道'}`,
  };
}
