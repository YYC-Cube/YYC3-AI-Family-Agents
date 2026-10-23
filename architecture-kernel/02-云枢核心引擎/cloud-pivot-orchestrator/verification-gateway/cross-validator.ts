/**
 * cross-validator（跨家人交叉验证）——verification-gateway 子模块。
 * 职责：请独立家人（如语枢·万物）复核，按共识率聚合为交叉验证意见。
 * 边界：只产出交叉验证意见（供 escalation 路径 cross-validate）；
 *       最终裁决归天枢 / 人类确认。
 *
 * v2.3.0（Phase B 最小闭环）：支持注册可插拔复核人——
 *   `(signal, request) => ReviewerOpinion`；无复核人时 **fail-safe 不默认成功**。
 * TODO(infra): 复核人函数替换为经 family-communication-bus 的异步独立复核。
 */

import type { JudgmentSignal } from '@shared/self-judge-kit';
import type { VerificationRequest, VerificationResult } from '../../types.js';

/** 复核人意见。 */
export interface ReviewerOpinion {
  /** 是否同意待验信号的核心主张。 */
  readonly agrees: boolean;
  /** 复核置信度 0–1（对该意见本身）。 */
  readonly confidence: number;
  readonly note?: string;
}

/** 复核人函数（独立于被验家人的判断通道）。 */
export type Reviewer = (signal: JudgmentSignal, request: VerificationRequest) => ReviewerOpinion;

/** 交叉验证输入（含待复核的自我判断信号）。 */
export interface CrossValidationInput {
  readonly request: VerificationRequest;
  readonly signal: JudgmentSignal;
  /** 独立复核家人清单（仅作展示；实际路由按已注册复核人）。 */
  readonly reviewers?: readonly string[];
}

/** 跨家人交叉验证器。 */
export class CrossValidator {
  private readonly reviewers = new Map<string, Reviewer>();

  /** 注册复核人（同 id 重复注册以最后为准）。 */
  registerReviewer(id: string, reviewer: Reviewer): void {
    this.reviewers.set(id, reviewer);
  }

  /** 已注册复核人 id 清单。 */
  reviewerIds(): readonly string[] {
    return [...this.reviewers.keys()];
  }

  /**
   * 请独立家人复核，按多数共识聚合：
   *   - 共识率 ≥ 0.5 且至少 1 票同意 → verified=true；
   *   - 多数反对 → verified=false（vConf=多数派平均置信度）；
   *   - 无复核人 → verified=false（fail-safe，不默认成功）。
   */
  async crossValidate(input: CrossValidationInput): Promise<VerificationResult> {
    if (this.reviewers.size === 0) {
      return {
        traceId: input.request.traceId,
        verified: false,
        sources: [],
        confidence: 0.3,
        detail: '无可用复核人（fail-safe：不默认成功）',
      };
    }

    const opinions: { id: string; opinion: ReviewerOpinion }[] = [];
    for (const [id, reviewer] of this.reviewers) {
      opinions.push({ id, opinion: reviewer(input.signal, input.request) });
    }
    const agree = opinions.filter((o) => o.opinion.agrees);
    const consensus = agree.length / opinions.length;

    if (agree.length > 0 && consensus >= 0.5) {
      const conf = avg(agree.map((o) => o.opinion.confidence));
      return {
        traceId: input.request.traceId,
        verified: true,
        sources: agree.map((o) => o.id),
        confidence: round2(conf),
        detail: `交叉验证共识 ${(consensus * 100).toFixed(0)}%（${agree.length}/${opinions.length} 同意）`,
      };
    }

    const against = opinions.filter((o) => !o.opinion.agrees);
    return {
      traceId: input.request.traceId,
      verified: false,
      sources: against.map((o) => o.id),
      confidence: round2(avg(against.map((o) => o.opinion.confidence))),
      detail: `交叉验证多数反对（同意率 ${(consensus * 100).toFixed(0)}%）`,
    };
  }
}

function avg(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
