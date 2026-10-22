/**
 * 遗忘策略（forgetting-policy）——「知」支柱 write-policy 子模块。
 * 职责：遗忘曲线驱动的衰减与清除决策（"何时忘"）。
 * 边界：只做决策与打分；真实删除由 memory-orchestrator.forget 执行。
 *
 * TODO(infra): 引入更贴近人类记忆的幂律遗忘曲线，并结合访问频率（spacing effect）。
 */

import type { ForgettingPolicy, MemoryLayer } from '../types.js';

/** 遗忘候选条目（供衰减计算）。 */
export interface ForgetCandidate {
  readonly id: string;
  readonly layer: MemoryLayer;
  readonly salience: number;
  readonly eventTime: number;
  /** 最近访问时间（用于间隔效应）。 */
  readonly lastAccessTs?: number;
}

/** 衰减结果。 */
export interface DecayResult {
  readonly decayedSalience: number;
  readonly shouldForget: boolean;
  readonly reason: string;
}

/** 遗忘策略引擎。 */
export class ForgettingPolicyEngine {
  /** 计算条目在当前策略下的衰减后显著度与是否遗忘。 */
  evaluate(candidate: ForgetCandidate, policy: ForgettingPolicy, now: number): DecayResult {
    const halfLife = policy.decayHalfLifeMs ?? 7 * 24 * 3600 * 1000; // 默认半衰期 7 天
    const last = candidate.lastAccessTs ?? candidate.eventTime;
    const dt = Math.max(0, now - last);
    const decayed = candidate.salience * Math.pow(0.5, dt / halfLife);

    const agedOut = policy.maxAgeMs !== undefined && now - candidate.eventTime > policy.maxAgeMs;
    const salienceLow = policy.minSalience !== undefined && decayed < policy.minSalience;
    // 语义/程序层默认永久（除非显式指定层）
    const layerInScope =
      policy.layers === undefined || policy.layers.includes(candidate.layer);

    if (!layerInScope) {
      return { decayedSalience: decayed, shouldForget: false, reason: 'out-of-scope' };
    }
    if (agedOut && salienceLow) {
      return { decayedSalience: decayed, shouldForget: true, reason: 'aged-and-faded' };
    }
    if (salienceLow) {
      return { decayedSalience: decayed, shouldForget: true, reason: 'salience-below-threshold' };
    }
    return { decayedSalience: decayed, shouldForget: false, reason: 'retained' };
  }
}
