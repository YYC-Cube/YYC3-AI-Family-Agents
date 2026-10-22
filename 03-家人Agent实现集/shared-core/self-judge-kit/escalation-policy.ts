/**
 * 升级策略（escalation-policy）——「自」支柱**安全护栏**。
 * 职责：confidence < τ_low 或 deviation.severity === 'high' 时**强制升级**。
 * 升级路径：cross-validate（请语枢·万物独立分析）→ human-confirm。
 *
 * ⚠️ 红线：这是安全护栏，**禁止低置信度直接产出**（§5.2）。
 *
 * TODO(infra): 接入 verification-gateway，cross-validate 时请求外部真值校验。
 */

import { DEFAULT_JUDGMENT_CONFIG, type ElevationDecision, type JudgmentConfig, type JudgmentSignal } from './types.js';

/** 升级策略。 */
export class EscalationPolicy {
  constructor(private readonly config: JudgmentConfig = DEFAULT_JUDGMENT_CONFIG) {}

  /** 依据判断信号决定升级路径。 */
  decide(signal: Pick<JudgmentSignal, 'confidence' | 'deviation'>): ElevationDecision {
    const triggeredBy: ElevationDecision['triggeredBy'] = [];
    if (signal.confidence < this.config.tauLow) triggeredBy.push('low-confidence');
    if (signal.deviation?.severity === 'high') triggeredBy.push('high-deviation');

    if (triggeredBy.length === 0) {
      return { escalation: 'none', reason: '置信度与偏离均在阈值内', triggeredBy };
    }

    // 严重偏离 → 直接人工确认；仅低置信 → 交叉验证
    const severeDeviation = signal.deviation?.severity === 'high';
    const veryLowConfidence = signal.confidence < this.config.tauLow * 0.5;

    if (severeDeviation || veryLowConfidence) {
      return {
        escalation: 'human-confirm',
        reason: severeDeviation
          ? '检测到高严重度行为偏离，需人工确认'
          : '置信度极低，需人工确认',
        triggeredBy,
      };
    }
    return {
      escalation: 'cross-validate',
      reason: `置信度 ${signal.confidence.toFixed(2)} < τ_low ${this.config.tauLow}，请语枢·万物独立分析`,
      triggeredBy,
    };
  }
}
