/**
 * 家族策略总线（family-policy-bus）——「治」支柱 policy-registry 子模块。
 * 职责（§5.4 统一拦截点）：任何**跨家人调用**先经策略裁决
 *   （allow / deny / allow-with-audit）；与 guardrail-registry 双向同步；
 *   命中 deny / audit 的裁决写入不可篡改审计链。
 * 边界：不实现具体检测（委托 security / quality-governance）。
 *
 * ⚠️ 这是总线上唯一的统一拦截入口（FamilyPolicyBus）。裁决顺序：
 *   护栏规则（guardrail） → 安全治理（守护） → 质量治理（宗师） → 策略注册中心。
 *
 * TODO(infra): 接入 family-communication-bus 中间件链；低延迟缓存 + 失败开放/关闭可配置。
 */

import type { GuardrailRule } from '@shared/memory-framework';
import type { ComplianceAudit } from '../compliance-audit/compliance-audit.js';
import type { PolicyRegistry } from './policy-registry.js';
import type { SecurityGovernance, SecuritySignal } from '../security-governance/security-governance.js';
import type { QualityGovernance, QualitySignal } from '../quality-governance/quality-governance.js';
import type { FamilyPolicyBus, PolicyDecision, ResourceRequest } from '../types.js';

/** 策略总线依赖（可注入，便于测试与替换）。 */
export interface FamilyPolicyBusDeps {
  readonly registry: PolicyRegistry;
  readonly audit: ComplianceAudit;
  readonly security: SecurityGovernance;
  readonly quality: QualityGovernance;
  /** 护栏规则来源（与 guardrail-registry 同步）。 */
  readonly guardrails?: () => readonly GuardrailRule[];
  /** 安全信号取数（守护 UEBA/SOAR）。 */
  readonly securitySignal?: (req: ResourceRequest) => SecuritySignal | undefined;
  /** 质量信号取数（宗师 SAST/黄金标准库）。 */
  readonly qualitySignal?: (req: ResourceRequest) => QualitySignal | undefined;
}

/** 家族策略总线实现（统一拦截）。 */
export class DefaultFamilyPolicyBus implements FamilyPolicyBus {
  constructor(private readonly deps: FamilyPolicyBusDeps) {}

  async evaluate(req: ResourceRequest): Promise<PolicyDecision> {
    // TODO(infra): 中间件链（鉴权→护栏→安全→质量→审计），失败开放/关闭可配置
    const decision = this.decide(req);

    // 命中 deny / allow-with-audit 时写入不可篡改审计链
    if (decision.decision !== 'allow') {
      this.deps.audit.append(req, decision);
    }
    return decision;
  }

  private decide(req: ResourceRequest): PolicyDecision {
    // 1) 护栏规则（与 guardrail-registry 同步）
    const guardrails = this.deps.guardrails?.() ?? [];
    const denied = guardrails.find((g) => g.action === 'deny' && this.guardrailMatches(g, req));
    if (denied) {
      return {
        decision: 'deny',
        policyId: denied.id,
        policyVersion: denied.version,
        reason: `护栏拦截：${denied.statement}`,
      };
    }

    // 2) 安全治理（智云·守护）
    const securitySignal = this.deps.securitySignal?.(req);
    if (securitySignal) {
      const securityDecision = this.deps.security.assess(req, securitySignal);
      if (securityDecision.decision === 'deny') return securityDecision;
    }

    // 3) 质量治理（格物·宗师）
    const qualitySignal = this.deps.qualitySignal?.(req);
    if (qualitySignal) {
      const qualityDecision = this.deps.quality.assess(req, qualitySignal);
      if (qualityDecision.decision !== 'allow') return qualityDecision;
    }

    // 4) 策略注册中心（策略即代码）——命中则 allow-with-audit
    const policies = this.deps.registry.match(req);
    if (policies.length > 0) {
      const policy = policies[0]!;
      return {
        decision: 'allow-with-audit',
        policyId: policy.id,
        policyVersion: policy.version,
        reason: `策略 ${policy.id}@${policy.version} 命中，需记录审计`,
        obligations: ['记录审计'],
      };
    }

    return { decision: 'allow', policyId: 'default-allow', policyVersion: '1.0.0', reason: '无拦截策略命中' };
  }

  private guardrailMatches(rule: GuardrailRule, req: ResourceRequest): boolean {
    // TODO(infra): 基于 interceptPoint（policy-bus）与作用域（agent/global）精确匹配
    void req;
    return rule.interceptPoint === 'policy-bus';
  }
}
