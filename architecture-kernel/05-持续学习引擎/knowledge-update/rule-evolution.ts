/**
 * 规则演化（rule-evolution）——「学」支柱 knowledge-update 子模块。
 * 职责：行为规则演化，**对接程序记忆**（procedural-memory 的可版本化规则）。
 * 边界：只产出演化**建议**，须经治理中心审核后才固化，避免规则自激。
 *
 * v2.5.0（Phase E）转实——演化门禁：
 *   - 仅 confidence ≥ 0.8 且溯源轨迹 ≥ 2 的高置信模式才产出演化建议
 *     （低质模式不触发规则变更，防规则自激）；
 *   - ruleId 缺省由 condition 的 FNV-1a 摘要确定（同情境同规则，跨周期可升级）；
 *   - 版本演化 fromVersion → minor +1（对齐 skill-versioner 语义）。
 * TODO(infra): 对接 guardrail-registry 与 family-policy-bus，规则变更写入不可篡改审计链；
 *              write-policy.salience-scorer 接入后替换固定 salience。
 */

import type { MemoryWriteRequest } from '@shared/memory-framework';
import type { PatternTriplet } from '../types.js';

/** 规则演化建议。 */
export interface RuleEvolutionProposal {
  readonly ruleId: string;
  readonly fromVersion: string;
  readonly toVersion: string;
  /** 变更内容（策略即代码片段）。 */
  readonly change: string;
  readonly rationale: string;
}

/** 演化门禁阈值（confidence ≥ 0.8 且溯源 ≥ 2）。 */
export const RULE_EVOLUTION_GATE = {
  minConfidence: 0.8,
  minSupportingTraces: 2,
} as const;

/** 已知规则的当前状态（供既有规则升级；缺省视为新规则 v1.0.0）。 */
export interface RuleCurrentState {
  readonly ruleId?: string;
  readonly fromVersion?: string;
}

/** 规则演化器。 */
export class RuleEvolution {
  /** 从高频模式推导行为规则演化建议（未达门禁返回 undefined）。 */
  propose(pattern: PatternTriplet, current?: RuleCurrentState): RuleEvolutionProposal | undefined {
    if (pattern.confidence < RULE_EVOLUTION_GATE.minConfidence) return undefined;
    if (pattern.supportingTraces.length < RULE_EVOLUTION_GATE.minSupportingTraces) return undefined;
    const ruleId = current?.ruleId ?? `rule-${fnv1a(pattern.condition)}`;
    const fromVersion = current?.fromVersion ?? '1.0.0';
    return {
      ruleId,
      fromVersion,
      toVersion: nextMinor(fromVersion),
      change: pattern.strategy,
      rationale: `${pattern.outcome}；溯源轨迹 ${pattern.supportingTraces.length} 条，置信 ${pattern.confidence}（达演化门禁，待治理中心审核）`,
    };
  }

  /** 产出程序记忆写入请求（治理审核通过后提交）。 */
  toWriteRequest(proposal: RuleEvolutionProposal): MemoryWriteRequest {
    return {
      layer: 'procedural',
      payload: proposal,
      salience: 0.7, // TODO(infra): 由 write-policy.salience-scorer 计算
      provenance: { agent: 'learning-engine', traceId: proposal.ruleId, ts: Date.now() },
    };
  }
}

/** FNV-1a 32 位摘要（确定性规则 ID）。 */
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** minor +1（与 skill-versioner.nextVersion 默认档对齐）。 */
function nextMinor(version: string): string {
  const parts = version.split('.').map((p) => Number.parseInt(p, 10) || 0);
  return `${parts[0] ?? 1}.${(parts[1] ?? 0) + 1}.0`;
}
