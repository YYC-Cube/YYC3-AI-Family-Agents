/**
 * 安全治理（security-governance）——「治」支柱子模块。
 * 职责：对接**智云·守护（UEBA / SOAR）**的治理适配层——将守护检测结果纳入策略裁决。
 * 边界：不实现检测算法（复用守护 detectors/），只做适配与策略化。
 *
 * TODO(infra): 对接守护 UEBA（异常行为分析）与 SOAR（自动响应）事件流。
 */

import type { PolicyDecision, ResourceRequest } from '../types.js';

/** 守护安全信号（UEBA 异常分 / SOAR 响应建议）。 */
export interface SecuritySignal {
  /** UEBA 异常评分 0–1（越高越可疑）。 */
  readonly anomalyScore: number;
  /** SOAR 建议动作。 */
  readonly recommendation: 'none' | 'block' | 'review';
  readonly detail?: string;
}

/** 安全治理适配层。 */
export class SecurityGovernance {
  /** anomalyThreshold：UEBA 异常分达到该值即拦截。 */
  constructor(private readonly anomalyThreshold = 0.8) {}

  /** 依据安全信号给出策略裁决片段（供 FamilyPolicyBus 汇总）。 */
  assess(req: ResourceRequest, signal: SecuritySignal): PolicyDecision {
    // TODO(infra): 对接守护 detectors/ 与 SOAR playbook；命中即 deny + 触发人工复核
    void req;
    if (signal.anomalyScore >= this.anomalyThreshold || signal.recommendation === 'block') {
      return {
        decision: 'deny',
        policyId: 'security-governance',
        policyVersion: '1.0.0',
        reason: '守护 UEBA 命中异常阈值',
      };
    }
    return { decision: 'allow', policyId: 'security-governance', policyVersion: '1.0.0', reason: '无安全异常' };
  }
}
