/**
 * 家族业务指标集（family-metrics）——「09-可观测性」业务埋点门面（v2.7.0，P0 数据面）。
 * 职责：把五支柱运行时事件翻译为 `family_*` 指标（Counter / Gauge / Histogram），
 *       供 Prometheus 抓取、告警规则消费（ops/observability/prometheus-rules.yaml）。
 * 边界：只记录；指标存储归 metrics-registry，HTTP 暴露归 metrics-server。
 *
 * 指标 → 告警映射（§P0 数据面闭环）：
 *   family_task_execution_duration_seconds          → HighPerfP99Latency
 *   family_task_executed_total{outcome}             → HighAvailabilityErrorRate
 *   family_selfjudge_agreement_ratio                → SelfJudgeCalibrationDrift
 *   family_memory_retrieval_duration_seconds        → MemoryRetrievalSlow
 *   family_learning_regression_failed_cases         → LearningRegressionFailure
 *   family_regression_gate_failed_total（CI 侧）     → RegressionGateFailed
 *   family_pillar_failed_cases{pillar}（CI 侧）      → FivePillarDashboardRed
 */

import type { BusEvent } from '../02-云枢核心引擎/types.js';
import type { CycleReport } from '../05-持续学习引擎/learning-loop.js';
import type { CircuitState } from '../07-自愈中心/degradation-controller/degradation-controller.js';
import type { HealingOutcome } from '../07-自愈中心/types.js';
import type { ConsistencySnapshot } from '../02-云枢核心引擎/cloud-pivot-orchestrator/verification-gateway/consistency-metrics.js';
import { MetricsRegistry, type Counter, type ExemplarOptions, type Gauge, type Histogram } from './metrics-registry.js';
import type { TaskExecutedPayload } from '../02-云枢核心引擎/family-communication-bus/trajectory-bridge.js';

/** 记忆检索耗时分桶（毫秒级操作，秒为单位：10ms～5s）。 */
const MEMORY_BUCKETS = [0.01, 0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2.5, 5] as const;

/** 业务指标集选项（v2.8.0 / L7）。 */
export interface FamilyMetricsOptions {
  /**
   * Exemplar 配置。未启用（默认）时 `/metrics` 输出与 v2.7.2 完全一致，
   * 也不会注册 `family_exemplars_dropped_total`。
   */
  readonly exemplars?: ExemplarOptions;
}

/** 家族业务指标集。 */
export class FamilyMetrics {
  readonly registry: MetricsRegistry;

  /** 任务执行结果计数（outcome=completed|failed）。 */
  readonly taskExecuted: Counter;
  /** 任务执行时长（finishedAt - startedAt，秒）。 */
  readonly taskDuration: Histogram;
  /** 总线-轨迹桥接事件（result=accepted|rejected）。 */
  readonly bridgeEvents: Counter;
  /** 学习周期数。 */
  readonly learningCycles: Counter;
  /** 固化技能数。 */
  readonly learningPromoted: Counter;
  /** 回滚技能数。 */
  readonly learningRolledBack: Counter;
  /** 本周期回归失败用例数（>0 触发告警）。 */
  readonly regressionFailedCases: Gauge;
  /** 自评-外验一致率（Phase B 门禁 > 90%）。 */
  readonly agreementRatio: Gauge;
  /** 海市蜃楼累计数（快照值）。 */
  readonly mirageCount: Gauge;
  /** 记忆检索耗时（秒）。 */
  readonly memoryRetrieval: Histogram;
  /** 自愈动作（layer × status）。 */
  readonly healingActions: Counter;
  /** 自愈 RTO（秒，按层）。 */
  readonly healingRto: Gauge;
  /** RTO 契约达成（1/0，按层）。 */
  readonly healingContractMet: Gauge;
  /** 熔断器状态（state=closed|half-open|open，当前态为 1）。 */
  readonly circuitState: Gauge;
  /** Exemplar 丢弃计数（仅在启用 exemplar 时注册）。 */
  readonly exemplarsDropped?: Counter;
  private readonly exemplarEnabled: boolean;

  constructor(registry: MetricsRegistry = new MetricsRegistry(), options: FamilyMetricsOptions = {}) {
    const ex = options.exemplars ?? {};
    this.exemplarEnabled = ex.enabled === true;
    const exemplarOptions: ExemplarOptions = this.exemplarEnabled
      ? {
        enabled: true,
        maxPerBucket: ex.maxPerBucket,
        ttlMs: ex.ttlMs,
        onDrop: () => this.exemplarsDropped?.inc(),
      }
      : { enabled: false };

    this.registry = registry;
    if (this.exemplarEnabled) {
      this.exemplarsDropped = registry.counter(
        'family_exemplars_dropped_total',
        'Exemplar 超出每桶上限被丢弃的累计数',
      );
    }
    this.taskExecuted = registry.counter('family_task_executed_total', '任务执行结果计数（outcome=completed|failed）');
    this.taskDuration = registry.histogram(
      'family_task_execution_duration_seconds',
      '任务执行时长（finishedAt-startedAt，秒）',
      undefined,
      exemplarOptions,
    );
    this.bridgeEvents = registry.counter(
      'family_trajectory_bridge_events_total',
      '总线-轨迹桥接事件（result=accepted|rejected）',
    );
    this.learningCycles = registry.counter('family_learning_cycles_total', '学习周期执行次数');
    this.learningPromoted = registry.counter('family_learning_promoted_total', '固化技能累计数');
    this.learningRolledBack = registry.counter('family_learning_rolled_back_total', '回滚技能累计数');
    this.regressionFailedCases = registry.gauge(
      'family_learning_regression_failed_cases',
      '本周期学习回归失败用例数',
    );
    this.agreementRatio = registry.gauge('family_selfjudge_agreement_ratio', '自评-外验一致率（Phase B 门禁 > 0.9）');
    this.mirageCount = registry.gauge('family_selfjudge_mirage_total', '海市蜃楼累计命中数');
    this.memoryRetrieval = registry.histogram(
      'family_memory_retrieval_duration_seconds',
      '记忆检索耗时（秒）',
      MEMORY_BUCKETS,
      exemplarOptions,
    );
    this.healingActions = registry.counter('family_healing_actions_total', '自愈动作计数（layer × status）');
    this.healingRto = registry.gauge('family_healing_rto_seconds', '自愈 RTO（秒，按层）');
    this.healingContractMet = registry.gauge('family_healing_contract_met', 'RTO 契约达成（1=达成 / 0=未达成）');
    this.circuitState = registry.gauge('family_circuit_state', '熔断器当前状态（state=closed|half-open|open）');
  }

  /**
   * 桥接事件埋点（TrajectoryBridge.onEvent 直连）。
   * 受理时同时记录任务结果与执行时长（payload 字段缺失则跳过时长）。
   */
  recordBridgeEvent(event: BusEvent, accepted: boolean): void {
    this.bridgeEvents.inc({ result: accepted ? 'accepted' : 'rejected' });
    if (!accepted) return;
    const p = event.payload as Partial<TaskExecutedPayload> | undefined;
    if (!p || typeof p.completed !== 'boolean') return;
    this.taskExecuted.inc({ outcome: p.completed ? 'completed' : 'failed' });
    if (typeof p.startedAt === 'number' && typeof p.finishedAt === 'number') {
      const seconds = (p.finishedAt - p.startedAt) / 1000;
      if (seconds >= 0) {
        if (this.exemplarEnabled && event.key.traceId) {
          this.taskDuration.observe(seconds, {}, {
            value: seconds,
            timestampMs: Date.now(),
            labels: { trace_id: event.key.traceId },
          });
        } else {
          this.taskDuration.observe(seconds);
        }
      }
    }
  }

  /** 学习周期埋点（LearningLoop.onCycle 直连）。 */
  recordCycle(report: CycleReport): void {
    this.learningCycles.inc();
    this.learningPromoted.inc({}, report.promoted.length);
    this.learningRolledBack.inc({}, report.rolledBack.length);
    let failedCases = 0;
    for (const r of report.regressions) failedCases += r.regressions.length;
    this.regressionFailedCases.set(failedCases);
  }

  /** 自愈记账埋点（RollbackController / DegradationController 产出）。 */
  recordHealing(outcome: HealingOutcome): void {
    this.healingActions.inc({ layer: outcome.layer, status: outcome.status });
    if (typeof outcome.rtoSeconds === 'number') {
      this.healingRto.set(outcome.rtoSeconds, { layer: outcome.layer });
    }
    this.healingContractMet.set(outcome.contractMet ? 1 : 0, { layer: outcome.layer });
  }

  /** 熔断器状态埋点（三态互斥：当前态置 1，其余置 0）。 */
  recordCircuitState(state: CircuitState): void {
    for (const s of ['closed', 'half-open', 'open'] as const) {
      this.circuitState.set(s === state ? 1 : 0, { state: s });
    }
  }

  /** 一致性指标埋点（ConsistencyTracker.snapshot 直连；无样本时保留上次值）。 */
  recordConsistency(snapshot: ConsistencySnapshot): void {
    if (snapshot.consistencyRate !== undefined) this.agreementRatio.set(snapshot.consistencyRate);
    this.mirageCount.set(snapshot.mirageCount);
  }

  /** 记忆检索耗时埋点（毫秒入参，秒级输出；传 traceId 且启用 exemplar 时附带样例）。 */
  observeMemoryRetrieval(milliseconds: number, traceId?: string): void {
    if (milliseconds < 0) return;
    const seconds = milliseconds / 1000;
    if (this.exemplarEnabled && traceId) {
      this.memoryRetrieval.observe(seconds, {}, {
        value: seconds,
        timestampMs: Date.now(),
        labels: { trace_id: traceId },
      });
      return;
    }
    this.memoryRetrieval.observe(seconds);
  }

  /** Exemplar 是否启用（供协议协商）。 */
  get exemplarsEnabled(): boolean {
    return this.exemplarEnabled;
  }

  /** 渲染 Prometheus 文本 exposition（0.0.4）。 */
  render(): string {
    return this.registry.render();
  }

  /** 渲染 OpenMetrics 1.0（末尾 `# EOF`）。 */
  renderOpenMetrics(): string {
    return this.registry.renderOpenMetrics();
  }
}

/** 记忆编排器最小接口（结构化约束，避免内核层依赖 03-家人Agent实现集）。 */
interface MemoryOrchestratorLike {
  retrieve(...args: unknown[]): Promise<unknown>;
  commit(...args: unknown[]): Promise<unknown>;
  forget(...args: unknown[]): Promise<unknown>;
  checkConsistency(...args: unknown[]): Promise<unknown>;
}

/**
 * 记忆编排器埋点包装（装饰器）：对 retrieve 计时并上报，其余方法透传。
 * 零侵入接入「知」支柱检索链路（MemoryOrchestratorImpl 无需改动）。
 */
export function instrumentMemoryOrchestrator<T extends MemoryOrchestratorLike>(
  inner: T,
  metrics: FamilyMetrics,
): T {
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === 'retrieve' && typeof value === 'function') {
        return async (...args: unknown[]) => {
          const start = Date.now();
          try {
            return await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          } finally {
            // ctx（第二参）若带 traceId，则用于 exemplar 下钻（L7）
            const ctx = args[1] as { traceId?: unknown } | undefined;
            const traceId = typeof ctx?.traceId === 'string' ? ctx.traceId : undefined;
            metrics.observeMemoryRetrieval(Date.now() - start, traceId);
          }
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
