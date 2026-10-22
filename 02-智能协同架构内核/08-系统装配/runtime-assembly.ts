/**
 * 系统装配（runtime-assembly）—— 五支柱运行时装配门面（v2.6.0，§6.4 infra 集成位闭环）。
 * 职责：把 infra-1～4 四个集成位接线为端到端闭环：
 *   总线 task.executed → TrajectoryBridge → LearningLoop.collector（infra-1，事件唯一入口）
 *   → 外验标签 loop.signal(traceId, goldenPass)（只登记不采集，防双采）
 *   → 回归失败 healingRollback 钩子 → RollbackController（infra-4，05→07 单向委托在此完成）
 *   → FileSkillStore 落盘（infra-3，技能历史重启可恢复）。
 * 边界：只做装配与端口适配；学习决策归 learning-loop，回滚记账归 07-自愈中心。
 *
 * 依赖方向（装配层是唯一同时知道 05 与 07 的地方）：
 *   05-持续学习引擎 ↛ 07-自愈中心（05 零硬依赖）；
 *   08-系统装配 → { 02-云枢核心引擎, 05-持续学习引擎, 07-自愈中心 }。
 *
 * 装配时序（构造顺序不可调换）：store → healingRollback（依赖 store）→ loop
 *   （依赖 store + hook）→ bridge（依赖 loop.components.collector）→ bridge.attach(bus)。
 */

import { EventBus } from '../02-云枢核心引擎/family-communication-bus/event-bus.js';
import { TrajectoryBridge } from '../02-云枢核心引擎/family-communication-bus/trajectory-bridge.js';
import { LearningLoop, type HealingRollbackEvent, type LearningLoopOptions, type SkillStorePort } from '../05-持续学习引擎/learning-loop.js';
import { FileSkillStore } from '../05-持续学习引擎/skill-consolidation/skill-store-file.js';
import { SkillVersioner } from '../05-持续学习引擎/skill-consolidation/skill-versioner.js';
import { RollbackController, type SkillRollbackPort } from '../07-自愈中心/rollback-controller/rollback-controller.js';
import {
  DegradationController,
  type DegradationOptions,
} from '../07-自愈中心/degradation-controller/degradation-controller.js';
import {
  FaultDetector,
  type DetectionSignal,
  type FaultDetectorOptions,
} from '../07-自愈中心/fault-detector/fault-detector.js';
import type { FaultEvent, HealingOutcome } from '../07-自愈中心/types.js';
import type { FamilyMetrics } from '../09-可观测性/family-metrics.js';

/** 装配选项。 */
export interface RuntimeAssemblyOptions {
  /** 缺省按 skillStoreDir 新建 FileSkillStore；显式传入则用注入库（测试用 InMemory）。 */
  readonly store?: SkillStorePort;
  /** 技能落盘目录（store 未显式注入时生效），默认 ./data/skills。 */
  readonly skillStoreDir?: string;
  /** 学习管道选项透传（regressionCases / evaluate / extractor / maxPromotionsPerCycle 等）。 */
  readonly learning?: LearningLoopOptions;
  /** 回滚观测回调（装配层已委托 07 记账后触发；部署侧接告警/审计）。 */
  readonly onRollback?: (event: HealingRollbackEvent, outcome: HealingOutcome) => void;
  /**
   * 业务指标集（v2.7.0）：传入即自动埋点——桥接受理/拒收、学习周期、自愈记账与 RTO。
   * 指标存储与渲染归 09-可观测性，装配层只负责把组件事件接到指标。
   */
  readonly metrics?: FamilyMetrics;
  /** 故障侦测选项（v2.7.2 纳入装配：去抖次数 / 窗口）。 */
  readonly faultDetector?: FaultDetectorOptions;
  /** 降级/熔断选项（v2.7.2 纳入装配：失败阈值 / 冷却期）。 */
  readonly degradation?: DegradationOptions;
}

/** 运行时装配句柄（端到端闭环的最小观测面）。 */
export interface RuntimeAssembly {
  readonly bus: EventBus;
  readonly bridge: TrajectoryBridge;
  readonly loop: LearningLoop;
  readonly store: SkillStorePort;
  readonly rollbackController: RollbackController;
  /** 故障侦测器（与降级控制器组成「愈」的 default 调度链路）。 */
  readonly faultDetector: FaultDetector;
  /** 降级/熔断控制器（状态迁移自动上报 `family_circuit_state`）。 */
  readonly degradation: DegradationController;
  /**
   * 侦测信号 → 去抖 → 故障事件 → 降级/熔断 → 指标记账（一条调用完成）。
   * 未达去抖阈值 / 信号回落时返回 undefined。
   */
  handleSignal(signal: DetectionSignal): HealingOutcome | undefined;
  /** 已接入的指标集（未传则为 undefined）。 */
  readonly metrics?: FamilyMetrics;
}

/**
 * 关键适配点（装配指导 §四 Step 3）：SkillStorePort（historyOf/replaceHistory）
 * ≠ SkillRollbackPort（rollbackSkill）——以 SkillVersioner 状态翻转桥接，
 * 翻转结果立即落盘（否则重启后回滚丢失）；无前置版本时返回 undefined（如实上报）。
 */
export function skillRollbackAdapter(store: SkillStorePort): SkillRollbackPort {
  const versioner = new SkillVersioner();
  return {
    rollbackSkill(skillId: string): string | undefined {
      const outcome = versioner.rollback(store.historyOf(skillId));
      store.replaceHistory(skillId, outcome.history);
      return outcome.restored?.version;
    },
  };
}

/** HealingRollbackEvent → FaultEvent 翻译（learning 层，走 SkillRollbackPort 分支）。 */
function toFaultEvent(event: HealingRollbackEvent): FaultEvent {
  return {
    id: event.faultId,
    layer: 'learning',
    type: 'regression-failed',
    severity: 'high',
    detail: `技能 ${event.skillId}@${event.version} 回归失败回滚`,
    detectedAt: Date.now(),
  };
}

/** 装配五支柱运行时（按序：store → hook → loop → bridge → attach）。 */
export function createRuntimeAssembly(options: RuntimeAssemblyOptions = {}): RuntimeAssembly {
  const metrics = options.metrics;

  // 1. 技能库（infra-3：缺省文件落盘，重启恢复）
  const store: SkillStorePort = options.store ?? new FileSkillStore(options.skillStoreDir ?? './data/skills');

  // 2. 自愈回滚委托（infra-4：05 钩子 → 07 记账；learning 层 RTO 契约 600s）
  const rollbackController = new RollbackController({ skill: skillRollbackAdapter(store) });
  const healingRollback: (event: HealingRollbackEvent) => void = (event) => {
    const outcome = rollbackController.rollback(toFaultEvent(event), event.skillId);
    metrics?.recordHealing(outcome); // 指标埋点：动作 / RTO / 契约达成
    options.onRollback?.(event, outcome);
  };

  // 3. 学习管道（事件唯一入口为 bridge；标签唯一入口为 loop.signal）
  //    周期观测钩子：装配层上报指标后，继续调用部署侧自定义 onCycle（不覆盖语义）
  const userOnCycle = options.learning?.onCycle;
  const onCycle: LearningLoopOptions['onCycle'] =
    metrics || userOnCycle
      ? (report) => {
        metrics?.recordCycle(report);
        userOnCycle?.(report);
      }
      : undefined;
  const loop = new LearningLoop(store, { ...options.learning, healingRollback, onCycle });

  // 4. 总线 + 桥接（infra-1：task.executed → collector；幂等去重由总线保证）
  //    桥接观察者：受理/拒收 + 任务结果与时长埋点
  const bus = new EventBus();
  const bridge = new TrajectoryBridge(
    loop.components.collector,
    'task.executed',
    metrics ? (event, accepted) => metrics.recordBridgeEvent(event, accepted) : undefined,
  );
  bridge.attach(bus);

  // 5. 「愈」默认调度链路（v2.7.2）：信号 → 去抖侦测 → 降级/熔断 → 指标记账
  const userOnStateChange = options.degradation?.onStateChange;
  const degradation = new DegradationController({
    ...options.degradation,
    onStateChange: (state) => {
      metrics?.recordCircuitState(state);
      userOnStateChange?.(state);
    },
  });
  const faultDetector = new FaultDetector(options.faultDetector);
  metrics?.recordCircuitState(degradation.circuitState); // 初始态上报（closed），避免无样本

  const handleSignal = (signal: DetectionSignal): HealingOutcome | undefined => {
    const fault = faultDetector.detect(signal);
    if (!fault) return undefined;
    const outcome = degradation.degrade(fault);
    metrics?.recordHealing(outcome);
    return outcome;
  };

  return {
    bus,
    bridge,
    loop,
    store,
    rollbackController,
    faultDetector,
    degradation,
    handleSignal,
    metrics,
  };
}
