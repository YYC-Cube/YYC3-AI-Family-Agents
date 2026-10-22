/**
 * 护栏注册（guardrail-registry）——「治」支柱在程序记忆侧的行为约束声明。
 * 职责：把家人的"行为约束/边界条件"提取为可版本化规则，供 family-policy-bus 统一拦截。
 * 边界：只登记规则，不执行检测（检测归治理中心 security/quality-governance）。
 *
 * TODO(infra): 与 shared-core/guardrail-registry 及 family-policy-bus 双向同步。
 */

/** 行为护栏规则（策略即代码的最小声明）。 */
export interface GuardrailRule {
  readonly id: string;
  readonly version: string;
  /** 规则作用域：作用家人/全局。 */
  readonly scope: 'agent' | 'global';
  /** 约束描述（人类可读）。 */
  readonly statement: string;
  /** 拦截点：总线/写入/输出。 */
  readonly interceptPoint: 'policy-bus' | 'memory-write' | 'output';
  /** 违规处置。 */
  readonly action: 'deny' | 'audit' | 'escalate';
  readonly status: 'active' | 'deprecated';
}

/** 护栏注册端口。 */
export interface GuardrailRegistryPort {
  register(rule: GuardrailRule): GuardrailRule;
  forAgent(agent: string): readonly GuardrailRule[];
  forInterceptPoint(point: GuardrailRule['interceptPoint']): readonly GuardrailRule[];
}

/** 护栏注册实现（内存桩）。 */
export class GuardrailRegistry implements GuardrailRegistryPort {
  private readonly rules = new Map<string, GuardrailRule>();

  register(rule: GuardrailRule): GuardrailRule {
    this.rules.set(rule.id, rule);
    // TODO(infra): 写回 family-policy-bus 的策略注册中心（policy-registry）
    return rule;
  }

  forAgent(agent: string): readonly GuardrailRule[] {
    return [...this.rules.values()].filter(
      (r) => r.status === 'active' && (r.scope === 'global' || r.id.includes(agent)),
    );
  }

  forInterceptPoint(point: GuardrailRule['interceptPoint']): readonly GuardrailRule[] {
    return [...this.rules.values()].filter((r) => r.status === 'active' && r.interceptPoint === point);
  }
}
