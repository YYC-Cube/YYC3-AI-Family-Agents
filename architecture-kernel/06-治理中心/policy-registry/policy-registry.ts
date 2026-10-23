/**
 * 策略注册中心（policy-registry）——「治」支柱 policy-registry 子模块。
 * 职责：**策略即代码**注册中心，含**版本化**（多版本共存、回滚）。
 * 边界：只注册与检索策略定义；裁决执行归 family-policy-bus（policy-bus）。
 *
 * TODO(infra): 落 Git 版本化 YAML + assets/schemas 校验；与 guardrail-registry 双向同步。
 */

import type { PolicyDefinition, PolicyScope, ResourceRequest } from '../types.js';

/** 策略注册中心（内存桩，多版本共存）。 */
export class PolicyRegistry {
  /** id → (version → definition) */
  private readonly versions = new Map<string, Map<string, PolicyDefinition>>();

  register(policy: PolicyDefinition): PolicyDefinition {
    const byVersion = this.versions.get(policy.id) ?? new Map<string, PolicyDefinition>();
    byVersion.set(policy.version, policy);
    this.versions.set(policy.id, byVersion);
    // TODO(infra): 写入 Git 版本化 YAML + schema 校验
    return policy;
  }

  /** 取某策略最新 active 版本。 */
  latest(id: string): PolicyDefinition | undefined {
    const byVersion = this.versions.get(id);
    if (!byVersion) return undefined;
    return [...byVersion.values()].filter((p) => p.status === 'active').pop();
  }

  /** 命中给定请求的候选策略（作用域匹配）。 */
  match(req: ResourceRequest): readonly PolicyDefinition[] {
    // TODO(infra): ABAC 属性匹配 + 优先级排序
    const out: PolicyDefinition[] = [];
    for (const byVersion of this.versions.values()) {
      const active = [...byVersion.values()].filter((p) => p.status === 'active').pop();
      if (active && this.scopeMatches(active, req)) out.push(active);
    }
    return out;
  }

  private scopeMatches(policy: PolicyDefinition, req: ResourceRequest): boolean {
    const scope: PolicyScope = policy.scope;
    const okAgent = !scope.agents || scope.wildcard === true || scope.agents.includes(req.actor);
    const okAction = !scope.actions || scope.actions.includes(req.action);
    const okResource = !scope.resources || scope.resources.includes(req.resource);
    return okAgent && okAction && okResource;
  }
}
