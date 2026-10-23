/**
 * 模式提炼（pattern-extractor）——「学」支柱 experience-reflow 子模块。
 * 职责：把成功轨迹抽象为「条件X → 策略Y → 结果Z」三元组。
 * 边界：只提炼；固化归 skill-merger / skill-versioner，回归归 stability-guard。
 *
 * v2.4.0（Phase C）确定性提炼（可审计、可回归）：
 *   - 仅 label === 'success' 的轨迹进入正样本池；
 *   - 按 (agent, taskType, 策略签名) 聚类；策略签名 = 步骤的 tool(缺省 action) 序列；
 *   - 同簇成功数 ≥ minSamples 且成功率 ≥ minSuccessRate 才成模式
 *     （失败样本拉低成功率，抑制偶然成功的过拟合）；
 *   - confidence = min(0.95, 0.5 + 0.15×(成功数−1)) × 成功率。
 *
 * v2.5.0（infra-2）语义抽象端口：
 *   - SemanticAbstractor 可注入端口——部署侧接 llm-adapter 结构化输出（JSON Schema）
 *     做语义级条件抽象；缺省 DeterministicSemanticAbstractor 保持 v2.4.0 输出逐字节一致；
 *   - 端口为同步契约：异步 LLM 由部署侧以预取/缓存适配（提炼管线保持同步可回归）。
 */

import type { LabeledTrajectory } from './outcome-labeler.js';
import type { PatternTriplet } from '../types.js';

/** 提炼选项。 */
export interface ExtractOptions {
  /** 成簇所需最少成功样本数（默认 2）。 */
  readonly minSamples?: number;
  /** 成簇所需最低成功率（默认 0.8）。 */
  readonly minSuccessRate?: number;
}

/** 语义抽象输入（簇级统计事实）。 */
export interface SemanticAbstractInput {
  readonly agent: string;
  readonly taskType: string;
  /** 策略签名（步骤的 tool/action 序列）。 */
  readonly strategy: string;
  readonly successCount: number;
  readonly failureCount: number;
  readonly successRate: number;
}

/** 语义抽象产出（三元组的 condition / outcome 文案）。 */
export interface SemanticAbstractResult {
  readonly condition: string;
  readonly outcome: string;
}

/**
 * 语义抽象端口（infra-2）。
 * 部署侧以 llm-adapter 结构化输出实现；**必须确定性可回放**——
 * 同一输入产出同一文案，否则破坏模式幂等（skillId 稳定性，见 learning-loop.skillIdOf）。
 */
export interface SemanticAbstractor {
  abstract(input: SemanticAbstractInput): SemanticAbstractResult;
}

/** 确定性默认实现：与 v2.4.0 输出逐字节一致（无外部依赖，可审计）。 */
export class DeterministicSemanticAbstractor implements SemanticAbstractor {
  abstract(input: SemanticAbstractInput): SemanticAbstractResult {
    return {
      condition: `${input.agent} · ${input.taskType}`,
      outcome: `任务成功率 ${(input.successRate * 100).toFixed(0)}%（${input.successCount}/${input.successCount + input.failureCount} 溯源轨迹）`,
    };
  }
}

/** 模式提炼器（确定性）。 */
export class PatternExtractor {
  constructor(
    private readonly minSamples = 2,
    private readonly minSuccessRate = 0.8,
    private readonly abstractor: SemanticAbstractor = new DeterministicSemanticAbstractor(),
  ) { }

  /** 兼容旧签名：以默认阈值提炼。 */
  extract(trajectories: readonly LabeledTrajectory[]): readonly PatternTriplet[] {
    return this.extractWith(trajectories, {});
  }

  /** 带阈值选项的提炼入口（供 pipeline 调优）。 */
  extractWith(
    trajectories: readonly LabeledTrajectory[],
    options: ExtractOptions,
  ): readonly PatternTriplet[] {
    const minSamples = options.minSamples ?? this.minSamples;
    const minRate = options.minSuccessRate ?? this.minSuccessRate;

    // 聚类：key = agent|taskType|策略签名
    const clusters = new Map<
      string,
      { agent: string; taskType: string; strategy: string; ok: string[]; fail: number }
    >();
    for (const lt of trajectories) {
      const t = lt.trajectory;
      const strategy = strategySignature(t);
      const key = `${t.agent}|${t.taskType}|${strategy}`;
      let c = clusters.get(key);
      if (!c) {
        c = { agent: t.agent, taskType: t.taskType, strategy, ok: [], fail: 0 };
        clusters.set(key, c);
      }
      if (lt.label === 'success') c.ok.push(t.traceId);
      else c.fail += 1; // failure 与 partial 同样构成对模式的反证
    }

    const patterns: PatternTriplet[] = [];
    for (const c of clusters.values()) {
      if (c.ok.length < minSamples) continue;
      const total = c.ok.length + c.fail;
      const rate = c.ok.length / total;
      if (rate < minRate) continue;
      // infra-2：语义抽象走端口（缺省确定性实现，输出与 v2.4.0 一致）
      const abs = this.abstractor.abstract({
        agent: c.agent,
        taskType: c.taskType,
        strategy: c.strategy,
        successCount: c.ok.length,
        failureCount: c.fail,
        successRate: rate,
      });
      const base = Math.min(0.5 + 0.15 * (c.ok.length - 1), 0.95);
      patterns.push({
        condition: abs.condition,
        strategy: c.strategy,
        outcome: abs.outcome,
        supportingTraces: [...c.ok],
        confidence: Math.round(base * rate * 100) / 100,
      });
    }
    // 置信度降序，保证确定性输出顺序
    return patterns.sort((a, b) => b.confidence - a.confidence);
  }
}

/** 策略签名：步骤的 tool（缺省 action）序列。 */
function strategySignature(t: { readonly steps: readonly { readonly action: string; readonly tool?: string }[] }): string {
  return t.steps.map((s) => s.tool ?? s.action).join('→');
}
