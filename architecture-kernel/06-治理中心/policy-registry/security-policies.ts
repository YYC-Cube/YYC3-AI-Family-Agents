/**
 * 安全策略映射（security-policies · P2-T4）—— 「治」支柱 policy-registry 子模块。
 * 职责：蓝图 1209 安全策略（零信任 / 内容过滤 / 注入检测）→ `PolicyRegistry.register()`
 *       的**策略即代码**映射；并提供**模式感知裁决**（SecurityPolicyBinder）：
 *       默认 **observe**（命中只记审计 allow-with-audit），**enforce 为显式开关**
 *       （逐策略声明，命中即 deny + 计数）。
 * 边界：不实现检测算法（复用守护 detectors）；策略定义经解析注入（内核零 IO）。
 */

import type { ComplianceAudit } from '../compliance-audit/compliance-audit.js';
import type { PolicyDefinition, PolicyDecision, PolicyScope, ResourceRequest } from '../types.js';
import type { PolicyRegistry } from './policy-registry.js';

/** 安全策略定义（= PolicyDefinition + 模式开关 + 来源锚点）。 */
export interface SecurityPolicyDefinition {
  readonly id: string;
  readonly version: string;
  /** 规则表达式名（检测算法锚点，如 detect-prompt-injection → 守护 injection-detector）。 */
  readonly rule: string;
  /** 裁决模式：observe（默认）= 命中记审计；enforce = 命中即拒绝。 */
  readonly mode: 'observe' | 'enforce';
  readonly scope: PolicyScope;
  /** 来源锚点（如 blueprint-1209）。 */
  readonly source?: string;
}

/**
 * 把安全策略注册进 PolicyRegistry（可枚举 / 可版本化）。
 * @returns 逐条模式表（id → mode），供 Binder 裁决。
 */
export function registerSecurityPolicies(
  registry: PolicyRegistry,
  defs: readonly SecurityPolicyDefinition[],
): Map<string, 'observe' | 'enforce'> {
  const modes = new Map<string, 'observe' | 'enforce'>();
  for (const def of defs) {
    const policy: PolicyDefinition = {
      id: def.id,
      version: def.version,
      rule: def.rule,
      scope: def.scope,
      status: 'active',
    };
    registry.register(policy);
    modes.set(def.id, def.mode);
  }
  return modes;
}

/** 策略绑定器依赖（可注入）。 */
export interface SecurityPolicyBinderDeps {
  readonly registry: PolicyRegistry;
  /** 审计链（observe / enforce 均留痕，篡改即断链）。 */
  readonly audit?: ComplianceAudit;
  /** 计数回调（指标面可挂 family_capability_plugin_denied_total 同类口径）。 */
  readonly onDeny?: (policyId: string, req: ResourceRequest) => void;
}

/** 安全策略绑定器（模式感知裁决；observe 默认，enforce 显式）。 */
export class SecurityPolicyBinder {
  private readonly modes: Map<string, 'observe' | 'enforce'>;
  private denyCount = 0;

  constructor(
    private readonly deps: SecurityPolicyBinderDeps,
    modes: Map<string, 'observe' | 'enforce'>,
  ) {
    this.modes = modes;
  }

  /** 已拦截计数（enforce 命中）。 */
  get deniedTotal(): number {
    return this.denyCount;
  }

  /** 已注册策略数（经 PolicyRegistry 的 active 视角）。 */
  get policyTotal(): number {
    return this.modes.size;
  }

  /**
   * 裁决一次资源请求：
   *   无命中 → allow（default-allow）；
   *   observe 命中 → allow-with-audit（记审计链）；
   *   enforce 命中 → deny（记审计链 + 计数 + 回调）。
   */
  evaluate(req: ResourceRequest): PolicyDecision {
    const hit = this.deps.registry.match(req)[0];
    if (!hit) {
      return { decision: 'allow', policyId: 'default-allow', policyVersion: '1.0.0', reason: '无安全策略命中' };
    }
    const mode = this.modes.get(hit.id) ?? 'observe';
    if (mode === 'enforce') {
      this.denyCount += 1;
      this.deps.onDeny?.(hit.id, req);
      const decision: PolicyDecision = {
        decision: 'deny',
        policyId: hit.id,
        policyVersion: hit.version,
        reason: `安全策略 enforce 拦截：${hit.rule}`,
        obligations: ['记录审计'],
      };
      this.deps.audit?.append(req, decision);
      return decision;
    }
    const decision: PolicyDecision = {
      decision: 'allow-with-audit',
      policyId: hit.id,
      policyVersion: hit.version,
      reason: `安全策略 observe 命中：${hit.rule}（只记审计，不阻断）`,
      obligations: ['记录审计'],
    };
    this.deps.audit?.append(req, decision);
    return decision;
  }
}
