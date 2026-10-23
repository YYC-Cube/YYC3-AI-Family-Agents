/**
 * ============================================================
 * YYC³ AI Family — 自愈中心（「愈」支柱）核心类型定义
 * ------------------------------------------------------------
 * 文档依据：YYC3-AI-Family-Agent-架构设计.md §5.5
 * 边界：负责故障侦测 / 降级 / 熔断 / 回滚 / 一致性修复 /
 *       记忆遗忘 / 学习回滚；
 *       不负责策略判定（归治理中心）、业务补偿逻辑（归各家人）。
 * ============================================================
 */

/** 自愈层级（§5.5 矩阵的六个层级）。 */
export type HealingLayer =
  | 'infrastructure'
  | 'model-service'
  | 'bus'
  | 'memory'
  | 'learning'
  | 'judgment';

/** 故障事件（fault-detector 产出）。 */
export interface FaultEvent {
  readonly id: string;
  readonly layer: HealingLayer;
  /** 故障类型，如 "node-unhealthy" / "llm-timeout" / "message-backlog"。 */
  readonly type: string;
  readonly severity: 'low' | 'med' | 'high' | 'critical';
  readonly detail: string;
  readonly detectedAt: number;
  readonly traceId?: string;
}

/** 自愈动作种类。 */
export type HealingActionKind =
  | 'scale' // K8s 扩缩容
  | 'restart' // Pod 重建
  | 'degrade' // 模型 / 能力降级
  | 'circuit-break' // 熔断
  | 'retry' // 重试
  | 'dead-letter' // 死信队列
  | 'throttle' // 限流
  | 'rollback' // 技能 / 灰度回滚
  | 'snapshot-repair' // 快照一致性修复
  | 'force-escalation'; // 强制升级 / 外部复验

/** 自愈动作（由降级/回滚/一致性修复控制器产出并执行）。 */
export interface HealingAction {
  readonly id: string;
  readonly faultId: string;
  readonly layer: HealingLayer;
  readonly kind: HealingActionKind;
  /** 动作目标（Pod / 服务 / 技能 / 记忆层）。 */
  readonly target: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

/** RTO/RPO 契约（§5.5 / §6.2）。 */
export interface RtoRpoContract {
  /** 恢复时间目标（秒）。 */
  readonly rtoSeconds: number;
  /** 恢复点目标（秒），0 表示不允许数据丢失。 */
  readonly rpoSeconds: number;
}

/** 自愈结果。 */
export interface HealingOutcome {
  readonly faultId: string;
  readonly actionId: string;
  readonly layer: HealingLayer;
  readonly status: 'healed' | 'degraded' | 'failed' | 'escalated';
  /** 是否满足 RTO/RPO 契约。 */
  readonly contractMet: boolean;
  /** 实际恢复耗时（秒）。 */
  readonly rtoSeconds?: number;
  /** 实际数据丢失（秒）。 */
  readonly rpoSeconds?: number;
  readonly at: number;
  readonly detail?: string;
}

/**
 * §5.5 自愈层级矩阵（layer → 故障类型 / 自愈动作 / 触发源）。
 */
export const HEALING_LAYER_MATRIX: Readonly<
  Record<HealingLayer, { faultType: string; healingAction: string; triggerSource: string }>
> = {
  // 第 1 层：基础设施——节点/副本异常，K8s 扩缩容，触发源为天枢 dashu-self-healing
  infrastructure: {
    faultType: '节点/副本异常',
    healingAction: 'K8s 扩缩容、Pod 重建',
    triggerSource: '天枢 dashu-self-healing',
  },
  // 第 2 层：模型服务——LLM 不可用/超时，Ollama 本地兜底 + 模型降级
  'model-service': {
    faultType: 'LLM 不可用/超时',
    healingAction: 'Ollama 本地兜底、模型降级',
    triggerSource: '千行/万物 provider',
  },
  // 第 3 层：总线——消息积压/丢失，重试、死信、限流
  bus: {
    faultType: '消息积压/丢失',
    healingAction: '重试、死信、限流',
    triggerSource: '通信总线',
  },
  // 第 4 层：记忆——跨层不一致/污染，consistency-repair 回滚至快照
  memory: {
    faultType: '跨层不一致/污染',
    healingAction: 'consistency-repair 回滚至快照',
    triggerSource: 'memory-orchestrator',
  },
  // 第 5 层：学习——新学习致能力退化，技能版本回滚 + 学习冻结
  learning: {
    faultType: '新学习致能力退化',
    healingAction: '技能版本回滚、学习冻结',
    triggerSource: 'stability-guard',
  },
  // 第 6 层：判断——置信度异常/自评失真，强制 escalation + 外部复验
  judgment: {
    faultType: '置信度异常/自评失真',
    healingAction: '强制 escalation、外部复验',
    triggerSource: 'verification-gateway',
  },
};

/**
 * RTO/RPO 目标（§5.5）：
 *   · 基础设施 RTO ≤ 60s / RPO = 0；
 *   · 记忆层 RTO ≤ 5min（300s）/ RPO = 0（快照增量）；
 *   · 学习回滚 RTO ≤ 10min（600s）；学习层未显式给定 RPO，
 *     因技能版本化永久（Git YAML），取 0。
 */
export const RTO_RPO_TARGETS: Readonly<
  Record<'infrastructure' | 'memory' | 'learning', RtoRpoContract>
> = {
  infrastructure: { rtoSeconds: 60, rpoSeconds: 0 },
  memory: { rtoSeconds: 5 * 60, rpoSeconds: 0 },
  learning: { rtoSeconds: 10 * 60, rpoSeconds: 0 },
};
