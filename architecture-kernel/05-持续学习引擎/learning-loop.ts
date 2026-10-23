/**
 * 经验回流闭环管道（learning-loop）——「学」支柱主回路门面（Phase C）。
 *
 * 首条学习回路（§5.3 / §6.4 Phase C）：
 *   verification-gateway 有效裁定（goldenPass 可靠标签）
 *   → TrajectoryCollector 采集 → OutcomeLabeler 标注
 *   → PatternExtractor 提炼「条件X→策略Y→结果Z」
 *   → SkillVersioner 固化为版本化技能（高频成功模式 → 技能）
 *   → RegressionTester 回归门禁（零新增退化才放行）
 *   → LearningRollbackController 回滚（失败学习不污染技能库）。
 *
 * 红线（「稳定性—可塑性」约束，§5.3）：
 *   未经回归门禁的技能不得 active；回归失败必须回滚至上一版本。
 *
 * TODO(infra): 接入 learning-scheduler（优先级/配额）与 knowledge-update（语义更新）；
 *              技能落盘对接 shared-core/memory-framework/procedural-memory。
 */

import { OutcomeLabeler, type LabelSignal, type LabeledTrajectory } from './experience-reflow/outcome-labeler.js';
import { PatternExtractor } from './experience-reflow/pattern-extractor.js';
import { TrajectoryCollector, type TrajectoryEvent } from './experience-reflow/trajectory-collector.js';
import { SkillVersioner } from './skill-consolidation/skill-versioner.js';
import { RegressionTester, type CaseEvaluator, type RegressionTestCase } from './stability-guard/regression-tester.js';
import { LearningRollbackController } from './stability-guard/rollback-controller.js';
import type { PatternTriplet, RegressionResult, SkillDefinition } from './types.js';

/** 回流输入：总线轨迹事件 + 该链路的外验标签信号（来自 verification-gateway 裁定）。 */
export interface ReflowItem {
  readonly event: TrajectoryEvent;
  /** 有效裁定是否证实（宗师质量判定 / gateway.effective.verified；最可靠标签）。 */
  readonly goldenPass?: boolean;
}

/** 单周期学习报告（可审计）。 */
export interface CycleReport {
  /** 本周期标注结果。 */
  readonly labeled: readonly LabeledTrajectory[];
  /** 提炼出的模式（置信度降序）。 */
  readonly patterns: readonly PatternTriplet[];
  /** 固化 / 升级的技能。 */
  readonly promoted: readonly SkillDefinition[];
  /** 被回归门禁打回并回滚的技能。 */
  readonly rolledBack: readonly { readonly skillId: string; readonly version: string; readonly restored?: string }[];
  /** 回归结果明细。 */
  readonly regressions: readonly RegressionResult[];
}

/** 管道选项。 */
export interface LearningLoopOptions {
  readonly labeler?: OutcomeLabeler;
  readonly extractor?: PatternExtractor;
  readonly versioner?: SkillVersioner;
  readonly regressionTester?: RegressionTester;
  readonly rollback?: LearningRollbackController;
  /** 回归用例与评估器（提供即启用回归门禁；缺省跳过门禁仅用于脚手架期）。 */
  readonly regressionCases?: readonly RegressionTestCase[];
  readonly evaluate?: CaseEvaluator;
  /** 每周期最多固化技能数（预算约束，默认 5）。 */
  readonly maxPromotionsPerCycle?: number;
  /**
   * 自愈联动钩子（infra-4）：回归失败触发技能回滚时回调，
   * 由部署侧委托 07-自愈中心 RollbackController 记账（RTO ≤ 600s，§5.5）。
   * 学习侧不直接依赖「愈」实现，仅以结构化事件解耦（05→07 单向依赖由装配层完成）。
   */
  readonly healingRollback?: HealingRollbackHook;
  /**
   * 周期观测钩子（v2.7.0 埋点）：runCycle 结束后回调完整报告，
   * 由装配层上报指标（promoted / rolledBack / 回归失败用例数）。只读观测，不影响学习决策。
   */
  readonly onCycle?: (report: CycleReport) => void;
  /**
   * 统一 id 解析钩子（P3-T3）：把固化模式映射到统一命名空间 logicalId
   * （如 `learned.qianhang.intent-detection`，见 skill-consolidation/skill-id.ts）。
   * 缺省不设置——技能仅携带 FNV 内部主键，读取侧按归并规则查询。
   */
  readonly logicalIdResolver?: (pattern: PatternTriplet) => string | undefined;
}

/** 自愈回滚事件（回归失败 → 技能回滚，供 07-自愈中心记账）。 */
export interface HealingRollbackEvent {
  readonly skillId: string;
  readonly version: string;
  readonly restored?: string;
  /** 确定性故障 id（可溯源到具体回归周期）。 */
  readonly faultId: string;
}

/** 自愈回滚钩子签名。 */
export type HealingRollbackHook = (event: HealingRollbackEvent) => void;

/** 技能库端口（内存实现；生产对接 procedural-memory 落盘）。 */
export interface SkillStorePort {
  historyOf(skillId: string): readonly SkillDefinition[];
  replaceHistory(skillId: string, history: readonly SkillDefinition[]): void;
  activeSkills(): readonly SkillDefinition[];
}

/** 内存技能库。 */
export class InMemorySkillStore implements SkillStorePort {
  private readonly store = new Map<string, SkillDefinition[]>();

  historyOf(skillId: string): readonly SkillDefinition[] {
    return this.store.get(skillId) ?? [];
  }

  replaceHistory(skillId: string, history: readonly SkillDefinition[]): void {
    this.store.set(skillId, [...history]);
  }

  activeSkills(): readonly SkillDefinition[] {
    const out: SkillDefinition[] = [];
    for (const hist of this.store.values()) {
      for (const s of hist) if (s.status === 'active') out.push(s);
    }
    return out;
  }
}

/** 经验回流闭环管道。 */
export class LearningLoop {
  private readonly collector = new TrajectoryCollector();
  private readonly labeler: OutcomeLabeler;
  private readonly extractor: PatternExtractor;
  private readonly versioner: SkillVersioner;
  private readonly regressionTester: RegressionTester;
  private readonly rollback: LearningRollbackController;
  private readonly regressionCases?: readonly RegressionTestCase[];
  private readonly evaluate?: CaseEvaluator;
  private readonly maxPromotions: number;
  private readonly healingRollback?: HealingRollbackHook;
  private readonly onCycle?: (report: CycleReport) => void;
  private readonly store: SkillStorePort;
  private readonly logicalIdResolver?: (pattern: PatternTriplet) => string | undefined;
  /** traceId → 标签信号（ingest 时登记，runCycle 时消费）。 */
  private readonly pendingSignals = new Map<string, LabelSignal>();

  constructor(store?: SkillStorePort, options: LearningLoopOptions = {}) {
    this.labeler = options.labeler ?? new OutcomeLabeler();
    this.extractor = options.extractor ?? new PatternExtractor();
    this.versioner = options.versioner ?? new SkillVersioner();
    this.regressionTester = options.regressionTester ?? new RegressionTester();
    this.rollback = options.rollback ?? new LearningRollbackController();
    this.regressionCases = options.regressionCases;
    this.evaluate = options.evaluate;
    this.maxPromotions = options.maxPromotionsPerCycle ?? 5;
    this.healingRollback = options.healingRollback;
    this.onCycle = options.onCycle;
    this.store = store ?? new InMemorySkillStore();
    this.logicalIdResolver = options.logicalIdResolver;
  }

  /** 暴露子组件（供观测与测试）。 */
  get components(): {
    readonly collector: TrajectoryCollector;
    readonly labeler: OutcomeLabeler;
    readonly extractor: PatternExtractor;
    readonly store: SkillStorePort;
  } {
    return { collector: this.collector, labeler: this.labeler, extractor: this.extractor, store: this.store };
  }

  /**
   * 登记外验标签信号（只登记不采集；v2.6.0 装配指导方案 A）。
   * 事件唯一入口为 TrajectoryBridge（总线→轨迹），本方法仅登记 verification-gateway
   * 的裁定结论（goldenPass），与已采轨迹按 traceId 关联——避免 ingest 双采同一事件。
   */
  signal(traceId: string, goldenPass: boolean): void {
    this.pendingSignals.set(traceId, { goldenPass });
  }

  /** 登记回流输入（只采集不学习；学习由 runCycle 显式触发，保证批处理边界清晰）。 */
  ingest(items: readonly ReflowItem[]): void {
    for (const item of items) {
      this.collector.collect(item.event);
      if (item.goldenPass !== undefined) {
        this.pendingSignals.set(item.event.traceId, { goldenPass: item.goldenPass });
      }
    }
  }

  /** 执行一个学习周期：标注 → 提炼 → 固化 → 回归门禁 → 回滚。 */
  runCycle(extractOptions?: { minSamples?: number; minSuccessRate?: number }): CycleReport {
    const trajectories = this.collector.drain();
    const labeled = trajectories.map((t) =>
      this.labeler.label(t, this.pendingSignals.get(t.traceId) ?? {}),
    );
    this.pendingSignals.clear();

    const patterns = this.extractor.extractWith(labeled, extractOptions ?? {});

    const promoted: SkillDefinition[] = [];
    const rolledBack: { skillId: string; version: string; restored?: string }[] = [];
    const regressions: RegressionResult[] = [];

    // 预算约束：每周期最多固化 maxPromotions 个技能
    for (const pattern of patterns.slice(0, this.maxPromotions)) {
      const skillId = skillIdOf(pattern);
      const history = [...this.store.historyOf(skillId)];
      const currentActive = history.find((s) => s.status === 'active');
      const version = currentActive
        ? this.versioner.nextVersion(currentActive.version)
        : '1.0.0';

      const skill: SkillDefinition = {
        id: skillId,
        logicalId: this.logicalIdResolver?.(pattern),
        name: `${pattern.condition} 最佳实践`,
        version,
        description: pattern.outcome,
        when: [pattern.condition],
        steps: pattern.strategy.split('→'),
        sourcePattern: pattern,
        status: 'active',
        createdAt: Date.now(),
        useCount: 0,
      };

      // 版本共存：旧 active 降级为 deprecated
      const nextHistory = history.map((s) =>
        s.status === 'active' ? { ...s, status: 'deprecated' as const } : s,
      );
      nextHistory.push(skill);

      // 回归门禁（§5.3 稳定性—可塑性红线）
      if (this.regressionCases && this.evaluate) {
        const result = this.regressionTester.run(skillId, version, this.regressionCases, this.evaluate);
        regressions.push(result);
        if (!result.passed) {
          const outcome = this.rollback.rollback(nextHistory);
          this.store.replaceHistory(skillId, outcome.history);
          rolledBack.push({
            skillId,
            version,
            restored: outcome.restored?.version,
          });
          // infra-4：委托「愈」侧记账（RTO/RPO 审计），学习侧保持零硬依赖
          this.healingRollback?.({
            skillId,
            version,
            restored: outcome.restored?.version,
            faultId: `learning-rollback-${skillId}-${version}`,
          });
          continue;
        }
      }

      this.store.replaceHistory(skillId, nextHistory);
      promoted.push(skill);
    }

    const report: CycleReport = { labeled, patterns, promoted, rolledBack, regressions };
    this.onCycle?.(report);
    return report;
  }
}

/** 确定性技能 ID：condition|strategy 的 FNV-1a 摘要（同簇同 ID，跨周期可升级）。 */
function skillIdOf(pattern: PatternTriplet): string {
  const input = `${pattern.condition}|${pattern.strategy}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `skill-${(h >>> 0).toString(16).padStart(8, '0')}`;
}
