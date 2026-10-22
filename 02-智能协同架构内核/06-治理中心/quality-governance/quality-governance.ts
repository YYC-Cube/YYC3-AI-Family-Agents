/**
 * 质量治理（quality-governance）——「治」支柱子模块。
 * 职责：对接**格物·宗师（SAST / 黄金标准库）**的治理适配层。
 * 边界：不实现分析算法（复用宗师 analyzers/），只做适配与入场门槛策略化。
 *
 * TODO(infra): 对接宗师 SAST 扫描结果与黄金标准库命中率。
 */

import type { PolicyDecision, ResourceRequest } from '../types.js';

/** 宗师质量信号。 */
export interface QualitySignal {
  /** 黄金标准库命中率 0–1（越高越合规）。 */
  readonly goldenHitRate: number;
  /** SAST 严重缺陷数。 */
  readonly sastCritical: number;
}

/** 质量治理适配层。 */
export class QualityGovernance {
  /** minGoldenHitRate：黄金标准库命中率下限。 */
  constructor(private readonly minGoldenHitRate = 0.9) {}

  /** 依据质量信号给出策略裁决片段（供 FamilyPolicyBus 汇总）。 */
  assess(req: ResourceRequest, signal: QualitySignal): PolicyDecision {
    // TODO(infra): 对接宗师 analyzers/；SAST 严重缺陷直接 deny，未达黄金标准转人工复核
    void req;
    if (signal.sastCritical > 0) {
      return {
        decision: 'deny',
        policyId: 'quality-governance',
        policyVersion: '1.0.0',
        reason: 'SAST 存在严重缺陷',
      };
    }
    if (signal.goldenHitRate < this.minGoldenHitRate) {
      return {
        decision: 'allow-with-audit',
        policyId: 'quality-governance',
        policyVersion: '1.0.0',
        reason: '未达黄金标准阈值，需人工复核',
        obligations: ['触发人工复核'],
      };
    }
    return { decision: 'allow', policyId: 'quality-governance', policyVersion: '1.0.0', reason: '质量达标' };
  }
}
