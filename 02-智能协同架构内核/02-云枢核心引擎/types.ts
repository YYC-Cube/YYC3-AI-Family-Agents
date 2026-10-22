/**
 * ============================================================
 * YYC³ AI Family — 云枢核心引擎 核心类型定义
 * ------------------------------------------------------------
 * 文档依据：YYC3-AI-Family-Agent-架构设计.md §4（目录树）、§5.2、§5.6。
 *
 * 【全局数据流排序（§5.6）】一次任务全生命周期：
 *   千行(意图/NLU) → 天枢编排(CAGEERF 分解) → 治理裁决(allow/deny/audit)
 *   → 目标家人执行 ← 记忆检索(知) → self-judge(JudgmentSignal)
 *   → verification-gateway 外部真值校验(自/治) → [低置信/大偏离 → escalation]
 *   → 总线 task.completed 事件 → 写入策略评分(知) → 落库
 *   → 学习引擎回流(学) → 伯乐个性化呈现
 *   云枢核心引擎承载其中「编排 / 总线 / 态势 / 通讯 / 基础设施自愈」环节。
 *
 * 【两处争论点处置（§4.2 / §5.6 声明）】
 *   1) MCP 协议层 = 对外**模型/工具接入标准**（协议适配层，TL3↔TL4 之间）；
 *      family-communication-bus = 家族**内部**事件总线（消息路由）。
 *      二者为**适配器关系**，非同一物：总经通过 McpAdapter 适配外部 MCP 服务。
 *   2) 两套"九层"编号以**能力分层 L** 为准（见
 *      `01-九层架构分层底座/types.ts`）。
 * ============================================================
 */

/* ------------------------------------------------------------------
 * 一、验证网关（verification-gateway，§5.2）—— 自评-外验闭环
 * ------------------------------------------------------------------ */

/** 外部真值源（oracle）种类：数据库 / API / 人工确认。 */
export type OracleKind = 'database' | 'api' | 'human-confirm';

/** 外部真值源注册项。 */
export interface OracleSource {
  readonly id: string;
  readonly kind: OracleKind;
  readonly description: string;
  /** 真值滞后（秒），用于置信度校准（越小越可信）。 */
  readonly lagSeconds?: number;
}

/** 验证请求（待校验主张 + 追踪上下文）。 */
export interface VerificationRequest {
  readonly traceId: string;
  /** 发起校验的家人。 */
  readonly agent: string;
  /** 待校验主张，如"数据已写入""任务已完成"。 */
  readonly claim: string;
  /** 是否要求人工确认通道。 */
  readonly requireHuman?: boolean;
}

/** 验证结果（供 confidence-calibrator 联合校准）。 */
export interface VerificationResult {
  readonly traceId: string;
  /** 是否与真实世界状态一致。 */
  readonly verified: boolean;
  /** 命中/参与校验的真值源 id。 */
  readonly sources: readonly string[];
  /** 校验后置信度 0–1。 */
  readonly confidence: number;
  readonly detail?: string;
}

/* ------------------------------------------------------------------
 * 二、家族通信总线（family-communication-bus）
 * ------------------------------------------------------------------ */

/** 事件投递模式：点对点 / 广播。 */
export type EventMode = 'point-to-point' | 'broadcast';

/** 幂等键 = traceId + agentId + seq（§6.2 幂等与去重）。 */
export interface IdempotencyKey {
  readonly traceId: string;
  readonly agentId: string;
  readonly seq: number;
}

/** 家族内部总线事件。 */
export interface BusEvent<T = unknown> {
  readonly key: IdempotencyKey;
  readonly topic: string;
  readonly mode: EventMode;
  /** 点对点模式的目标家人。 */
  readonly target?: string;
  readonly payload: T;
  readonly at: number;
}

/**
 * MCP 协议适配器。
 * 边界：MCP = 对外模型/工具接入标准；本适配器只做编解码，不做内部路由。
 */
export interface McpAdapter {
  readonly id: string;
  /** 将内部 BusEvent 编码为对外 MCP 消息。 */
  encode(event: BusEvent): unknown;
  /** 将对外 MCP 消息解码为内部 BusEvent。 */
  decode(raw: unknown): BusEvent;
}

/* ------------------------------------------------------------------
 * 三、全局状态中心（global-status-center）
 * ------------------------------------------------------------------ */

/** 家人运行状态。 */
export interface FamilyRuntimeStatus {
  readonly agent: string;
  readonly status: 'ok' | 'degraded' | 'down';
  readonly activeTasks: number;
  readonly at: number;
}

/** 服务状态。 */
export interface ServiceStatus {
  readonly name: string;
  readonly status: 'ok' | 'degraded' | 'down';
  readonly latencyP99Ms?: number;
}

/** 资源状态（CPU / 内存 / 存储 / 副本）。 */
export interface ResourceStatus {
  readonly resource: string;
  readonly usedRatio: number;
  readonly capacity?: number;
}

/** 全局态势图。 */
export interface GlobalSituation {
  readonly at: number;
  readonly families: readonly FamilyRuntimeStatus[];
  readonly services: readonly ServiceStatus[];
  readonly resources: readonly ResourceStatus[];
  readonly overall: 'ok' | 'degraded' | 'down';
}

/* ------------------------------------------------------------------
 * 四、云枢电话系统（family-phone-system）
 * ------------------------------------------------------------------ */

/** 通讯录联系人。 */
export interface Contact {
  readonly id: string;
  readonly name: string;
  readonly agent: string;
  /** 专属热线。 */
  readonly hotline?: string;
}

/** 通话记录。 */
export interface CallRecord {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly startedAt: number;
  readonly durationMs?: number;
  readonly outcome?: 'answered' | 'missed' | 'rejected';
}

/** 私信。 */
export interface DirectMessage {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly content: string;
  readonly at: number;
}

/* ------------------------------------------------------------------
 * 五、云枢编排器（cloud-pivot-orchestrator）
 * ------------------------------------------------------------------ */

/** CAGEERF 七阶段（C-A-G-E-E-R-F）。语义见架构设计.md §5.7 建议稿。 */
export type CageerfStage =
  | 'clarify'
  | 'analyze'
  | 'generate'
  | 'evaluate'
  | 'execute'
  | 'review'
  | 'finalize';

/** 千行解析出的用户意图。 */
export interface Intent {
  readonly id: string;
  readonly traceId: string;
  /** 原始话语。 */
  readonly utterance: string;
  /** 意图解析置信度 0–1（千行 + self-judge）。 */
  readonly confidence: number;
}

/** CAGEERF 任务步骤。 */
export interface TaskStep {
  readonly id: string;
  readonly stage: CageerfStage;
  /** 承接该步骤的家人（owner）。 */
  readonly owner: string;
  readonly goal: string;
  /** 前置步骤 id。 */
  readonly dependsOn?: readonly string[];
}

/** 任务计划。 */
export interface TaskPlan {
  readonly traceId: string;
  readonly intentId: string;
  readonly steps: readonly TaskStep[];
}

/** 调度结果。 */
export interface DispatchResult {
  readonly traceId: string;
  readonly dispatched: readonly string[];
  readonly failed: readonly string[];
}
