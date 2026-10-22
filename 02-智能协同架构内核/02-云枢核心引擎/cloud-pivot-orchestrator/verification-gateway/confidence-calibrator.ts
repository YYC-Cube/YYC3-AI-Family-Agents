/**
 * confidence-calibrator（置信度校准器）——verification-gateway 子模块。
 * 职责：基于验证结果校准自评置信度（回填 JudgmentSignal）。
 * 边界：只做校准；裁决归天枢 / 人类。
 *
 * v2.3.0（Phase B 最小闭环）确定性校准公式：
 *   - 证实（noisy-OR，两路独立证据合成）：
 *       calibrated = 1 − (1 − selfConf) × (1 − verifyConf)
 *     外部真值源以 vConf 置信证实 → 剩余不确定性按 (1−vConf) 收缩；
 *   - 驳斥（海市蜃楼强衰减）：
 *       calibrated = selfConf × (1 − verifyConf)
 *     外部以 vConf 置信驳斥 → 自评只剩「裁定可能出错」的残差。
 *   门禁：校准误差（|calibrated − 真实结果| 均值）≤ 0.15（§6.4 Phase B），
 *        误差统计由 ConsistencyTracker 维护。
 * TODO(infra): 累积真实样本后升级为温度缩放 / Platt scaling。
 */

import type { JudgmentSignal } from '@shared/self-judge-kit';
import type { VerificationResult } from '../../types.js';

/** 校准结果。 */
export interface CalibrationResult {
  readonly agent: string;
  /** 校准后置信度 0–1。 */
  readonly confidence: number;
  /** 校准幅度（校准后 − 校准前）。 */
  readonly delta: number;
}

/** 置信度校准器。 */
export class ConfidenceCalibrator {
  /** 用验证结果校准自评信号（确定性公式，可审计）。 */
  calibrate(signal: JudgmentSignal, verification: VerificationResult): CalibrationResult {
    const selfConf = clamp01(signal.confidence);
    const vConf = clamp01(verification.confidence);
    const calibrated = verification.verified
      ? 1 - (1 - selfConf) * (1 - vConf) // noisy-OR 证实
      : selfConf * (1 - vConf); // 驳斥强衰减
    const rounded = round4(calibrated);
    return {
      agent: signal.agent,
      confidence: rounded,
      delta: round4(rounded - selfConf),
    };
  }
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
