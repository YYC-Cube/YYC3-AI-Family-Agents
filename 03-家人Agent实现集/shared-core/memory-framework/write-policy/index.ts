/**
 * 写入策略（write-policy）——「知」支柱的"决策进程"（生命周期表中间件）。
 * 生命周期：—（决策进程）｜存储介质：内存｜写入触发：持续运行。
 *
 * 组合：salience-scorer（评分）+ consolidation（巩固）+ forgetting-policy（遗忘）。
 */

import type { MemoryWriteRequest, WritableMemoryLayer } from '../types.js';
import { Consolidation } from './consolidation.js';
import { ForgettingPolicyEngine } from './forgetting-policy.js';
import { SalienceScorer, type SalienceResult } from './salience-scorer.js';

export { Consolidation } from './consolidation.js';
export type { CandidateItem, ConsolidationPlan } from './consolidation.js';
export { ForgettingPolicyEngine } from './forgetting-policy.js';
export type { DecayResult, ForgetCandidate } from './forgetting-policy.js';
export { SalienceScorer } from './salience-scorer.js';
export type { SalienceInput, SalienceResult } from './salience-scorer.js';

/** 写入裁决结果。 */
export interface WriteDecision {
  readonly accepted: boolean;
  /** 经写策略计算/覆写的显著度。 */
  readonly salience: number;
  readonly layer: WritableMemoryLayer;
  /** 被拒原因。 */
  readonly reason?: string;
}

/**
 * 写入策略。
 * 流程：显著度评分 → 阈值裁决（是否写入）→（异步）巩固/遗忘。
 */
export class WritePolicy {
  constructor(
    private readonly scorer = new SalienceScorer(),
    private readonly consolidation = new Consolidation(),
    readonly forgetting = new ForgettingPolicyEngine(),
    private readonly acceptThreshold = 0.35,
  ) { }

  /** 对写入请求做显著度评分与接收裁决。 */
  evaluate(req: MemoryWriteRequest, novelty = 0.5): WriteDecision {
    const scored: SalienceResult = this.scorer.score({
      layer: req.layer,
      payload: req.payload,
      sourceJudgment: req.sourceJudgment,
      novelty,
    });
    if (scored.salience < this.acceptThreshold) {
      return {
        accepted: false,
        salience: scored.salience,
        layer: req.layer,
        reason: `salience ${scored.salience.toFixed(2)} < threshold ${this.acceptThreshold}`,
      };
    }
    return { accepted: true, salience: scored.salience, layer: req.layer };
  }

  /** 暴露巩固器供编排器在任务结束时调用。 */
  planConsolidation(candidates: Parameters<Consolidation['plan']>[0]) {
    return this.consolidation.plan(candidates);
  }
}
