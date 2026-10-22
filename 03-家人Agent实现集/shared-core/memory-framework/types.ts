/**
 * ============================================================
 * YYC³ AI Family — 记忆框架（「知」支柱）核心类型定义
 * ------------------------------------------------------------
 * 文档依据：YYC3-AI-Family-Agent-架构设计.md §5.1
 * 边界：负责感知暂存 / 上下文窗口 / 情景轨迹 / 语义图谱 /
 *       程序记忆 / 写入决策 / 检索编排；
 *       不负责模型推理（llm-adapter）、业务意图（家人 core）、
 *       安全判定（治理中心）。
 * ============================================================
 */

import type { JudgmentSignal } from '@shared/self-judge-kit';

/**
 * 记忆分层（五大认知层）。
 * 完整的「七层」= 五层认知记忆 + write-policy（决策进程） + memory-orchestrator（编排）。
 */
export type MemoryLayer =
  | 'sensory'
  | 'working'
  | 'episodic'
  | 'semantic'
  | 'procedural';

/** 可写入长期持久化存储的层（对应 §5.1 `MemoryWriteRequest.layer`）。 */
export type WritableMemoryLayer = 'episodic' | 'semantic' | 'procedural';

/** 任务类型（用于 memory-orchestrator 的检索路由）。 */
export type TaskType =
  | 'intent-classification'
  | 'analysis'
  | 'prediction'
  | 'recommendation'
  | 'creation'
  | 'quality-review'
  | 'security-audit'
  | 'orchestration'
  | 'general';

/** 记忆作用域：区分「跨家人共享内核记忆」与「家人本地会话缓存」（解决 C5 双写风险）。 */
export interface MemoryScope {
  /** 属主家人标识；缺省表示全局共享记忆。 */
  readonly agent?: string;
  /** 租户隔离维度。 */
  readonly tenantId?: string;
  /** 会话隔离维度（sensory/working 层必需）。 */
  readonly sessionId?: string;
  /** 是否把全局共享记忆纳入检索结果。默认 true。 */
  readonly includeGlobal?: boolean;
}

/** 记忆预算（工作上下文窗口分配上限）。 */
export interface MemoryBudget {
  /** 单次检索注入上下文的最大 token 数。 */
  readonly maxTokens?: number;
  /** 单次检索返回的最大条目数。 */
  readonly maxItems?: number;
}

/** 任务上下文（编排器检索/写入时携带的运行时语境）。 */
export interface TaskContext {
  readonly traceId: string;
  readonly agent: string;
  readonly taskId: string;
  readonly taskType: TaskType;
  readonly startedAt: number;
  readonly scope: MemoryScope;
  readonly budget?: MemoryBudget;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** 检索请求。 */
export interface MemoryQuery {
  /** 自然语言/关键词查询文本。 */
  readonly text?: string;
  /** 仅检索指定层；缺省按路由策略决定。 */
  readonly layers?: readonly MemoryLayer[];
  /** 实体锚点（语义图谱检索用）。 */
  readonly entities?: readonly string[];
  /** 双时态时间范围：事件时间与记录时间的可选区间。 */
  readonly eventTimeRange?: TimeRange;
  readonly recordTimeRange?: TimeRange;
  /** 返回条数上限。 */
  readonly limit?: number;
  /** 相关性得分下限。 */
  readonly minScore?: number;
  readonly scope: MemoryScope;
}

/** 时间区间。 */
export interface TimeRange {
  readonly from?: number;
  readonly to?: number;
}

/** 单条检索命中。 */
export interface MemoryHit {
  readonly layer: MemoryLayer;
  readonly id: string;
  /** 命中内容（层语义决定具体结构）。 */
  readonly content: unknown;
  /** 与查询的相关性得分 0–1。 */
  readonly score: number;
  /** 写入时的显著度 0–1（§5.1）。 */
  readonly salience: number;
  readonly eventTime?: number;
  readonly recordTime?: number;
}

/** 检索结果包。 */
export interface MemoryBundle {
  readonly query: MemoryQuery;
  readonly hits: readonly MemoryHit[];
  readonly traceId: string;
  readonly ts: number;
  /** 各层命中统计。 */
  readonly layerStats?: Readonly<Partial<Record<MemoryLayer, number>>>;
}

/** 记忆写入请求（§5.1 契约；salience 由 write-policy 计算）。 */
export interface MemoryWriteRequest {
  readonly layer: WritableMemoryLayer;
  readonly payload: unknown;
  /** 信息显著度 0–1，由 write-policy.salience-scorer 计算。 */
  readonly salience: number;
  /** 【自】低置信但成功的轨迹 → 高价值学习素材。 */
  readonly sourceJudgment?: JudgmentSignal;
  readonly provenance: MemoryProvenance;
}

/** 溯源信息（不可篡改审计基座）。 */
export interface MemoryProvenance {
  readonly agent: string;
  readonly traceId: string;
  readonly ts: number;
}

/** 写入回执。 */
export interface WriteAck {
  readonly accepted: boolean;
  readonly layer: WritableMemoryLayer;
  readonly traceId: string;
  readonly salience: number;
  readonly committedAt: number;
  /** 落库后生成的记忆 id（被拒时缺省）。 */
  readonly id?: string;
  /** 被拒原因（如显著度过低、策略拦截）。 */
  readonly reason?: string;
}

/** 遗忘策略（遗忘曲线驱动）。 */
export interface ForgettingPolicy {
  /** 作用层；缺省表示全部层。 */
  readonly layers?: readonly MemoryLayer[];
  /** 超过该存活时长的条目进入候选遗忘。 */
  readonly maxAgeMs?: number;
  /** 显著度低于该阈值的条目进入候选遗忘。 */
  readonly minSalience?: number;
  /** 衰减半衰期（毫秒），用于遗忘曲线计算。 */
  readonly decayHalfLifeMs?: number;
  /** 物理删除（true）或软删除/降权（false）。默认软删除。 */
  readonly hardDelete?: boolean;
  readonly scope: MemoryScope;
}

/** 遗忘单条明细。 */
export interface ForgetDetail {
  readonly id: string;
  readonly layer: MemoryLayer;
  readonly reason: string;
}

/** 遗忘回执。 */
export interface ForgetAck {
  readonly forgotten: number;
  readonly layers: readonly MemoryLayer[];
  readonly traceId: string;
  readonly ts: number;
  readonly details: readonly ForgetDetail[];
}

/** 一致性问题的分类。 */
export type ConsistencyIssueKind =
  | 'missing'
  | 'conflict'
  | 'stale'
  | 'orphan'
  | 'duplicate';

/** 跨层一致性问题。 */
export interface ConsistencyIssue {
  readonly kind: ConsistencyIssueKind;
  readonly layer: MemoryLayer;
  readonly id?: string;
  readonly detail: string;
  readonly severity: 'low' | 'med' | 'high';
  /** 是否可由 consistency-repair 自动修复（对接自愈中心 §5.5）。 */
  readonly repairable: boolean;
}

/** 一致性校验报告。 */
export interface ConsistencyReport {
  readonly scope: MemoryScope;
  readonly ok: boolean;
  readonly checkedAt: number;
  readonly issues: readonly ConsistencyIssue[];
  /** 参与校验的层。 */
  readonly layers: readonly MemoryLayer[];
}

/**
 * 记忆分层生命周期契约（§5.1 表格的代码级镜像）。
 * 存储介质与写入触发点在此声明，供真实基础设施（DB/向量库/图库）接入时对齐。
 */
export const MEMORY_LIFECYCLE: Readonly<
  Record<MemoryLayer, { retention: string; medium: string; writeTrigger: string }>
> = {
  sensory: {
    retention: '秒级（会话内）',
    medium: '内存环形缓冲',
    writeTrigger: '输入到达即写',
  },
  working: {
    retention: '会话期',
    medium: '内存 + Redis',
    writeTrigger: '注意力评分动态维护',
  },
  episodic: {
    retention: '天~永久',
    medium: '关系库 + 对象存储',
    writeTrigger: '任务链路结束',
  },
  semantic: {
    retention: '永久（可遗忘）',
    medium: '图库 / 向量库',
    writeTrigger: '实体/关系确认',
  },
  procedural: {
    retention: '版本化永久',
    medium: 'Git 版本化 YAML',
    writeTrigger: '学习引擎固化 / 人工审核',
  },
};

/**
 * 记忆编排器契约（§5.1 核心接口契约）。
 * 所有检索请求经此入口路由到相应记忆层，所有写入经 write-policy 显著度评分后落库。
 */
export interface MemoryOrchestrator {
  retrieve(query: MemoryQuery, ctx: TaskContext): Promise<MemoryBundle>;
  /** 经 write-policy 显著度评分后提交写入。 */
  commit(bundle: MemoryWriteRequest): Promise<WriteAck>;
  /** 遗忘曲线驱动。 */
  forget(policy: ForgettingPolicy): Promise<ForgetAck>;
  checkConsistency(scope: MemoryScope): Promise<ConsistencyReport>;
}
