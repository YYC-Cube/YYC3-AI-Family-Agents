/**
 * ============================================================
 * YYC³ AI Family — 治理中心（「治」支柱）核心类型定义
 * ------------------------------------------------------------
 * 文档依据：YYC3-AI-Family-Agent-架构设计.md §5.4
 * 边界：负责策略注册与版本化 / 安全治理 / 质量治理 / 合规审计 /
 *       权限（RBAC+ABAC）/ 总线统一拦截；
 *       不负责具体检测算法实现（复用守护 detectors/、宗师 analyzers/）。
 *
 * 核心机制：
 *   · **策略即代码**（Policy as Code）——所有安全/质量/行为策略以代码声明，
 *     纳入 assets/schemas 校验与 Git 版本化。
 *   · **白名单可版本化**——策略与护栏规则（guardrail-registry）双向同步。
 *   · **审计不可篡改**——审计链（compliance-audit）对接智云·守护 与 格物·宗师。
 * ============================================================
 */

/** 策略裁决（§5.4 契约，字段严格对齐）。 */
export interface PolicyDecision {
  readonly decision: 'allow' | 'deny' | 'allow-with-audit';
  readonly policyId: string;
  readonly policyVersion: string;
  readonly reason: string;
  /** 附加义务，如 ["记录审计","触发人工复核"]。 */
  readonly obligations?: readonly string[];
}

/** 资源请求（§5.4 中 FamilyPolicyBus.evaluate 的入参）。 */
export interface ResourceRequest {
  /** 链路追踪 id。 */
  readonly traceId: string;
  /** 主体：发起跨家人调用的家人标识。 */
  readonly actor: string;
  /** 请求动作，如 "tool.invoke" / "memory.write" / "model.call"。 */
  readonly action: string;
  /** 目标资源，如工具名 / 记忆层 / 服务名。 */
  readonly resource: string;
  /** ABAC 属性（可含租户、角色、数据密级等）。 */
  readonly attributes?: Readonly<Record<string, unknown>>;
}

/** 策略定义（策略即代码的代码级契约）。 */
export interface PolicyDefinition {
  readonly id: string;
  readonly version: string;
  /** 规则表达式 / 规则脚本（策略即代码）。 */
  readonly rule: string;
  /** 作用域：全局或指定家人 / 动作 / 资源。 */
  readonly scope: PolicyScope;
  readonly status: 'active' | 'deprecated';
}

/** 策略作用域（未列出的维度视为不限制）。 */
export interface PolicyScope {
  readonly agents?: readonly string[];
  readonly actions?: readonly string[];
  readonly resources?: readonly string[];
  /** 缺省作用域是否通配（true = 未命中即适用）。 */
  readonly wildcard?: boolean;
}

/** 审计记录（不可篡改链的一环）。 */
export interface AuditRecord {
  readonly id: string;
  readonly ts: number;
  readonly traceId: string;
  readonly actor: string;
  readonly action: string;
  readonly resource: string;
  readonly decision: PolicyDecision;
  /** 本条内容哈希（防篡改）。 */
  readonly hash: string;
  /** 前一条哈希（链式，篡改即断链）。 */
  readonly prevHash: string;
}

/**
 * 家族策略总线（§5.4 统一拦截点契约）。
 * 任何跨家人调用先经此入口裁决（allow / deny / allow-with-audit）。
 */
export interface FamilyPolicyBus {
  evaluate(req: ResourceRequest): Promise<PolicyDecision>;
}
