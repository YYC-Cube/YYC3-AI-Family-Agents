/**
 * 检索适配器（retrieval-adapter）——「知」支柱 episodic-store 子模块。
 * 职责：把情景存储的命中结果，适配为框架统一的 `MemoryHit`。
 * 边界：只做形状适配与打分归一，不改变检索语义。
 *
 * TODO(infra): 对接向量检索 + 关键词检索的混合排序（RRF）与重排（rerank）。
 */

import type { MemoryHit } from '../types.js';
import type { TrajectoryEvent } from './trajectory-logger.js';

/** 情景检索输入。 */
export interface EpisodicRetrievalInput {
  readonly events: readonly TrajectoryEvent[];
  readonly scoreOf: (e: TrajectoryEvent) => number;
  readonly salienceOf: (e: TrajectoryEvent) => number;
}

/** 情景检索适配器。 */
export class EpisodicRetrievalAdapter {
  /** 将轨迹事件适配为统一 MemoryHit 列表，并按得分降序。 */
  toHits(input: EpisodicRetrievalInput, limit = 50, minScore = 0): readonly MemoryHit[] {
    return input.events
      .map<MemoryHit>((e) => ({
        layer: 'episodic',
        id: e.id,
        content: e.payload,
        score: clamp01(input.scoreOf(e)),
        salience: clamp01(input.salienceOf(e)),
        eventTime: e.eventTime,
        recordTime: e.recordTime,
      }))
      .filter((h) => h.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
