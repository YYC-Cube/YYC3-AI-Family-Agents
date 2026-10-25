/**
 * 技能固化（skill-merger）——「学」支柱 skill-consolidation 子模块。
 * 职责：把高频成功模式（PatternTriplet）固化为**可版本化**技能。
 * 语义（M25 由桩转实）：
 *   - merge(pattern)：阈值门（support ≥ minSupport ∧ confidence ≥ minConfidence）；
 *     达标即按模式三元组**确定性模板**生成技能定义——id 由 FNV 主键哈希派生
 *     （`skill-<8hex>`，与 P3-T3 `learned.*` 归并约定兼容），steps = 条件/策略/结果
 *     三段式（自然语言步骤的 LLM 精化归语义执行臂域，内核不做网络）；
 *   - toWriteRequest(skill)：写入请求（salience 静态 0.8 占位，write-policy
 *     接线后替换——注释保留）。
 * 边界：只固化；淘汰归 skill-pruner，版本/回滚归 skill-versioner；
 *       写入程序记忆前必须经 stability-guard 回归（§5.3）。
 */

import type { MemoryWriteRequest } from '@shared/memory-framework';
import type { PatternTriplet, SkillDefinition } from '../types.js';

/** FNV-1a 32bit（与 skill-id.ts 历史主键同族；确定性、零依赖）。 */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `skill-${hash.toString(16).padStart(8, '0')}`;
}

/** 技能固化器。 */
export class SkillMerger {
  /** 固化阈值：支撑轨迹数 ≥ minSupport 且 confidence ≥ minConfidence。 */
  constructor(
    private readonly minSupport = 3,
    private readonly minConfidence = 0.7,
  ) {}

  /** 将模式固化为技能定义（写入前置回归由 stability-guard 负责；未达阈值返回 undefined）。 */
  merge(pattern: PatternTriplet, now: number = Date.now()): SkillDefinition | undefined {
    if (pattern.supportingTraces.length < this.minSupport) return undefined;
    if (pattern.confidence < this.minConfidence) return undefined;
    const seed = `${pattern.condition}|${pattern.strategy}|${pattern.outcome}`;
    return {
      id: fnv1a(seed),
      name: pattern.strategy.slice(0, 40),
      version: '0.1.0',
      description: `固化自高频模式：${pattern.condition} → ${pattern.strategy}（${pattern.outcome}）`,
      when: [pattern.condition],
      steps: [
        `识别情境：${pattern.condition}`,
        `执行策略：${pattern.strategy}`,
        `核验成效：${pattern.outcome}`,
      ],
      sourcePattern: pattern,
      status: 'active',
      createdAt: now,
      useCount: pattern.supportingTraces.length,
    };
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
