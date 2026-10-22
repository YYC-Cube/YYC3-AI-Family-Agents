/**
 * ============================================================
 * YYC³ AI Family — 持续学习引擎（「学」支柱）核心类型定义
 * ------------------------------------------------------------
 * 文档依据：YYC3-AI-Family-Agent-架构设计.md §5.3
 * 边界：负责经验回流 / 模式提炼 / 技能巩固与淘汰 / 知识更新 /
 *       学习稳定性保障 / 学习调度；
 *       不负责模型权重微调（参数级适应列为后置可选演进）。
 *
 * 学习模式声明（v2.0.0，避免「在线微调」误读）：
 *   v2.0.0 的学习 ＝ **程序性知识沉淀**（skill-consolidation 固化技能）
 *                    ＋ **语义知识更新**（knowledge-update 更新语义记忆）；
 *   参数级微调（权重适应）为**后置可选项**（§6.4 Phase D），
 *   以「稳定性—可塑性困境」为约束，不得阻塞本引擎落地。
 *
 * ⚠️ 稳定性—可塑性约束（必选，见 §5.3）：
 *   任何新学习必须经 forgetting-detector 检查是否导致既有能力退化；
 *   冲突案例触发 regression-tester 回归；失败学习由 rollback-controller
 *   回滚至上一技能版本（对接 §5.5 自愈中心）。
 * ============================================================
 */

import type { JudgmentSignal } from '@shared/self-judge-kit';

/**
 * 学习模式（v2.0.0 仅前两者）。
 * - procedural-consolidation：程序性知识沉淀（高频成功模式 → 技能）。
 * - semantic-update：语义知识更新（冲突/过时事实 → 语义记忆）。
 * 参数级微调（权重适应）为后置可选演进，不在此枚举内（§6.4 Phase D）。
 */
export type LearningMode = 'procedural-consolidation' | 'semantic-update';

/** 结果标注（不依赖人工标注，借助既有信号推导）。 */
export type OutcomeLabel = 'success' | 'failure' | 'partial';

/** 任务轨迹（从通信总线 task.executed 链路采集）。 */
export interface TaskTrajectory {
  readonly traceId: string;
  /** 发起家人。 */
  readonly agent: string;
  readonly taskType: string;
  /** 工具/步骤调用序列。 */
  readonly steps: readonly TrajectoryStep[];
  readonly startedAt: number;
  readonly finishedAt: number;
  /** 链路是否正常结束（总线侧判定）。 */
  readonly completed: boolean;
  /** 【自】自我判断信号：低置信但成功 → 高价值学习素材（见 §5.1）。 */
  readonly judgment?: JudgmentSignal;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** 轨迹单步。 */
export interface TrajectoryStep {
  readonly order: number;
  readonly action: string;
  readonly tool?: string;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly ok: boolean;
  readonly latencyMs?: number;
}

/** 「条件X → 策略Y → 结果Z」三元组模式（pattern-extractor 用 LLM 抽象）。 */
export interface PatternTriplet {
  /** 条件 X：触发情境（意图 / 前置事实 / 约束）。 */
  readonly condition: string;
  /** 策略 Y：采取的动作序列 / 工具使用模式。 */
  readonly strategy: string;
  /** 结果 Z：可观测成效。 */
  readonly outcome: string;
  /** 支撑该模式的轨迹（溯源）。 */
  readonly supportingTraces: readonly string[];
  /** 置信度 0–1（出现频次 + 结果一致性）。 */
  readonly confidence: number;
}

/** 技能定义（可版本化，固化自高频成功模式）。 */
export interface SkillDefinition {
  readonly id: string;
  readonly name: string;
  /** 语义化版本，如 "1.2.0"。 */
  readonly version: string;
  readonly description: string;
  /** 触发条件（意图 / 前置事实）。 */
  readonly when: readonly string[];
  /** 执行步骤。 */
  readonly steps: readonly string[];
  /** 由哪个模式三元组固化而来。 */
  readonly sourcePattern?: PatternTriplet;
  readonly status: 'active' | 'deprecated' | 'rolled-back';
  readonly createdAt: number;
  /** 最近使用时间（供 skill-pruner 淘汰久未使用）。 */
  readonly lastUsedAt?: number;
  /** 使用频次。 */
  readonly useCount: number;
}

/** 回归结果（学习后稳定性验证，对接 tests/regression 基线）。 */
export interface RegressionResult {
  readonly skillId: string;
  readonly skillVersion: string;
  readonly passed: boolean;
  /** 通过率 0–1。 */
  readonly passRate: number;
  /** 回归用例总数。 */
  readonly total: number;
  /** 退化用例（新旧能力退化）。 */
  readonly regressions: readonly RegressionCase[];
  readonly at: number;
}

/** 回归用例。 */
export interface RegressionCase {
  readonly id: string;
  readonly expected: string;
  readonly actual: string;
  /** 该用例此前是否通过（true 表示本次新引入退化）。 */
  readonly previouslyPassed: boolean;
}

/** 学习任务（供 learning-scheduler 排序与配额）。 */
export interface LearningTask {
  readonly id: string;
  readonly mode: LearningMode;
  /** 优先级得分（越大越优先）。 */
  readonly priority: number;
  /** 预估资源配额（token / 调用次数）。 */
  readonly budget: LearningBudget;
  readonly status: 'pending' | 'running' | 'done' | 'failed' | 'rolled-back';
  /** 素材来源（轨迹 / 模式）。 */
  readonly source: string;
  readonly requestedAt: number;
}

/** 学习资源配额。 */
export interface LearningBudget {
  /** 允许消耗的 LLM token 上限。 */
  readonly maxTokens: number;
  /** 允许的调用次数。 */
  readonly maxCalls: number;
}
