/**
 * 技能固化（skill-merger）——「学」支柱 skill-consolidation 子模块。
 * 职责：把高频成功模式（PatternTriplet）固化为**可版本化**技能。
 * 边界：只固化；淘汰归 skill-pruner，版本/回滚归 skill-versioner；
 *       写入程序记忆前必须经 stability-guard 回归（§5.3）。
 *
 * TODO(infra): 经 llm-adapter 生成技能步骤；达阈值后经 stability-guard 回归，
 *              通过方写 procedural-memory（经 memory-orchestrator.commit）。
 */

import type { MemoryWriteRequest } from '@shared/memory-framework';
import type { PatternTriplet, SkillDefinition } from '../types.js';

/** 技能固化器。 */
export class SkillMerger {
  /** 固化阈值：支撑轨迹数 ≥ minSupport 且 confidence ≥ minConfidence。 */
  constructor(
    private readonly minSupport = 3,
    private readonly minConfidence = 0.7,
  ) {}

  /** 将模式固化为技能定义（写入前置回归由 stability-guard 负责）。 */
  merge(pattern: PatternTriplet): SkillDefinition | undefined {
    // TODO(infra): LLM 生成技能步骤 + 与既有技能去重合并；未达阈值则不固化
    if (pattern.supportingTraces.length < this.minSupport) return undefined;
    if (pattern.confidence < this.minConfidence) return undefined;
    // 桩：回归通过后由 skill-versioner 分配版本号并落 procedural-memory
    return undefined;
  }

  /** 产出程序记忆写入请求（经稳定性回归通过后提交）。 */
  toWriteRequest(skill: SkillDefinition): MemoryWriteRequest {
    return {
      layer: 'procedural',
      payload: skill,
      salience: 0.8, // TODO(infra): 由 write-policy.salience-scorer 计算
      provenance: { agent: 'learning-engine', traceId: skill.id, ts: Date.now() },
    };
  }
}
