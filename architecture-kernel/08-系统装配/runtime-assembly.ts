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
import { OutcomeLabeler } from '../05-持续学习引擎/experience-reflow/outcome-labeler.js';
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
import { instrumentOutcomeLabeler } from '../09-可观测性/collaboration-instrumentation.js';
import { BudgetAllocator, ZERO_BUDGET } from '../05-持续学习引擎/learning-scheduler/budget-allocator.js';
import { LearningPriorityQueue } from '../05-持续学习引擎/learning-scheduler/priority-queue.js';
import { logicalIdOfStored } from '../05-持续学习引擎/skill-consolidation/skill-id.js';
import type { LearningBudget, SkillDefinition } from '../05-持续学习引擎/types.js';

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
   * 业务指标集（v2.7.0）：传入即自动埋点——桥接受理/拒收、学习周期、自愈记账与 RTO；
   * v2.15.0（P1-T4b）起自动接线复盘回流两端（受理=分母，标注=分子）。
   * 千行澄清 / escalation / 审计链三类由部署侧以 collaboration-instrumentation 包装后接线；
   * 能力供给三类（技能装载 / MCP 工具调用 / 准入拒绝，§6.3）由部署侧以
   * capability-instrumentation 包装后接线。
   */
  readonly metrics?: FamilyMetrics;
  /** 学习调度（M24）：传入即启用「请求-排空」学习周期闸——优先级入队 + 配额授予
   *  （每周期消耗一份 token 份额与 1 次调用，份额缺省 = 总量/允许调用数·均分；
   *  耗尽跳过并回队，周期失败全额归还）。 */
  readonly learningScheduler?: {
    readonly total: LearningBudget;
    /** 每周期 token 消耗（缺省 = 总量，即只按调用次数限流）。 */
    readonly tokensPerCycle?: number;
    /** 任务时钟（缺省 Date.now；测试可冻结）。 */
    readonly now?: () => number;
    /**
     * 累计 LLM token 计量器（P8 收尾 b · usage 回填）：注入真实用量生产端
     * （如 LlmUsageCounter.totalTokens）即按周期前后差值冲抵授予份额，
     * 未消耗部分归还剩余（超支按授予额封顶）；缺省按整份授予消耗（M24 语义不变）。
     */
    readonly usageMeter?: () => number;
  };
  /**
   * 固化落位（P8 收尾 a · merger→registry 装配位）：传入即把每周期晋升技能经
   * consolidatedSkillForRegistry 适配注册（同 id 同版本幂等覆盖；logicalId 按
   * skill-id.ts 归并约定——与 procedural-memory SkillRegistry 结构兼容，
   * 内核零反向依赖 family-agents）。
   */
  readonly skillRegistry?: SkillRegistrySink;
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
  /** 学习调度闸（M24，options.learningScheduler 传入时存在）。 */
  readonly learningScheduler?: LearningSchedulerHandle;
}

/** 周期用量三元组（P8 收尾 b）：授予份额 · 计量差值实耗 · 归还未消耗。 */
export interface CycleUsage {
  readonly grantedTokens: number;
  readonly actualTokens: number;
  readonly releasedTokens: number;
}

/** 学习周期排空结果：执行（含周期报告与用量回填）或因配额跳过（任务保留在队）。 */
export type LearningCycleOutcome =
  | { readonly status: 'executed'; readonly report: ReturnType<LearningLoop['runCycle']>; readonly usage: CycleUsage }
  | { readonly status: 'skipped-budget' };

/** 学习调度闸句柄：请求-排空两段式（配额授予与归还对调用方零暴露）。 */
export interface LearningSchedulerHandle {
  /** 请求一次学习周期（priority 越大越先执行；缺省 0）。 */
  requestCycle(priority?: number): void;
  /** 按优先级排空队列至配额耗尽（耗尽任务保留回队；周期异常全额归还后抛出）。 */
  drain(): readonly LearningCycleOutcome[];
  /** 队列深度。 */
  pending(): number;
  /** 剩余配额快照。 */
  available(): LearningBudget;
  /** 配额是否耗尽（任一维度为 0）。 */
  exhausted(): boolean;
}

/** 注册中心步骤草稿（procedural-memory SkillStep 结构子集）。 */
export interface RegistryStepDraft {
  readonly order: number;
  readonly action: string;
}

/**
 * 注册中心落位形态（P8 收尾 a）：与 procedural-memory SkillDefinition 结构兼容
 * （字段形态即接口——内核零反向依赖 family-agents；steps 序号化，内核专有字段
 * sourcePattern/createdAt/useCount 不外带）。
 */
export interface RegistrySkillDraft {
  readonly id: string;
  readonly logicalId?: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly when: readonly string[];
  readonly steps: readonly RegistryStepDraft[];
  readonly status: 'active' | 'deprecated' | 'rolled-back';
}

/** 固化落位端口（register 同 id 同版本幂等覆盖——SkillRegistry 语义）。 */
export interface SkillRegistrySink {
  register(skill: RegistrySkillDraft): unknown;
}

/**
 * 内核固化 SkillDefinition → 注册中心落位形态（P8 收尾 a）：
 * logicalId 按 skill-id.ts 归并约定（显式声明优先，FNV 主键归并 `learned.*`），
 * steps 字符串序列转 order/action 两元组。
 */
export function consolidatedSkillForRegistry(skill: SkillDefinition): RegistrySkillDraft {
  return {
    id: skill.id,
    logicalId: logicalIdOfStored(skill),
    name: skill.name,
    version: skill.version,
    description: skill.description,
    when: skill.when,
    steps: skill.steps.map((action, i) => ({ order: i + 1, action })),
    status: skill.status,
  };
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
  //    固化落位（P8 收尾 a）：晋升技能适配注册 skillRegistry，再透传部署侧 onPromoted
  const userOnPromoted = options.learning?.onPromoted;
  const onPromoted: LearningLoopOptions['onPromoted'] =
    options.skillRegistry || userOnPromoted
      ? (skills) => {
        for (const skill of skills) options.skillRegistry?.register(consolidatedSkillForRegistry(skill));
        userOnPromoted?.(skills);
      }
      : undefined;
  const loop = new LearningLoop(store, {
    ...options.learning,
    // 协同度 · 复盘回流接线（P1-T4b）：标注臂命中（分子）；分母在下方桥接观察者记账
    labeler: metrics
      ? instrumentOutcomeLabeler(options.learning?.labeler ?? new OutcomeLabeler(), metrics)
      : options.learning?.labeler,
    healingRollback,
    onPromoted,
    onCycle,
  });

  // 4. 总线 + 桥接（infra-1：task.executed → collector；幂等去重由总线保证）
  //    桥接观察者：受理/拒收 + 任务结果与时长埋点 + 复盘分母（受理=决策周期入库）
  const bus = new EventBus();
  const bridge = new TrajectoryBridge(
    loop.components.collector,
    'task.executed',
    metrics
      ? (event, accepted) => {
        metrics.recordBridgeEvent(event, accepted);
        if (accepted) metrics.recordReplay(1, 0); // 协同度 · 复盘覆盖率分母（P1-T4b）
      }
      : undefined,
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

  // 6. 学习调度闸（M24）：请求-排空两段式——优先级入队 + 每周期配额授予
  //    （tokensPerCycle + 1 次调用）；耗尽跳过保留回队；周期异常全额归还后透传。
  //    P8 收尾 b：usageMeter 注入即按周期前后差值回填真实用量——未消耗份额归还
  //    （超支按授予额封顶）；无计量器维持整份授予消耗（M24 语义不变）。
  let cycleSeq = 0;
  const scheduler: LearningSchedulerHandle | undefined = options.learningScheduler
    ? (() => {
        const { total, tokensPerCycle, now, usageMeter } = options.learningScheduler!;
        const allocator = new BudgetAllocator(total);
        const queue = new LearningPriorityQueue();
        const clock = now ?? Date.now;
        // 每周期 token 份额：显式 tokensPerCycle 优先；缺省按允许调用数均分总量
        //（此时调用次数成为唯一约束维度，与「只按调用次数限流」语义一致）
        const perCycle = {
          maxTokens: tokensPerCycle ?? Math.floor(total.maxTokens / Math.max(1, total.maxCalls)),
          maxCalls: 1,
        };
        return {
          requestCycle(priority = 0): void {
            cycleSeq += 1;
            queue.enqueue({
              id: `cycle-${clock()}-${cycleSeq}`,
              mode: 'procedural-consolidation',
              priority,
              budget: perCycle,
              status: 'pending',
              source: 'runtime-assembly',
              requestedAt: clock(),
            });
          },
          drain(): readonly LearningCycleOutcome[] {
            const out: LearningCycleOutcome[] = [];
            while (queue.size() > 0) {
              const task = queue.dequeue()!;
              const granted = allocator.allocate(task);
              if (granted === ZERO_BUDGET) {
                queue.enqueue(task); // 配额耗尽：保留回队，由调用方决定降级/等待
                break;
              }
              const beforeTokens = usageMeter ? usageMeter() : 0;
              try {
                const report = loop.runCycle();
                const actualTokens = usageMeter
                  ? Math.max(0, usageMeter() - beforeTokens)
                  : granted.maxTokens;
                const releasedTokens = Math.max(0, Math.min(granted.maxTokens, granted.maxTokens - actualTokens));
                if (releasedTokens > 0) allocator.release({ maxTokens: releasedTokens, maxCalls: 0 });
                out.push({
                  status: 'executed',
                  report,
                  usage: { grantedTokens: granted.maxTokens, actualTokens, releasedTokens },
                });
              } catch (error) {
                allocator.release({ maxTokens: granted.maxTokens, maxCalls: granted.maxCalls });
                queue.enqueue({ ...task, status: 'failed' });
                throw error;
              }
            }
            return out;
          },
          pending: () => queue.size(),
          available: () => allocator.available,
          exhausted: () => allocator.exhausted,
        };
      })()
    : undefined;

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
    ...(scheduler ? { learningScheduler: scheduler } : {}),
  };
}
