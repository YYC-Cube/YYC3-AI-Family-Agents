/**
 * 情景记忆（episodic-store）——「知」支柱第 3 层。
 * 生命周期：天~永久｜存储介质：关系库 + 对象存储｜写入触发：任务链路结束。
 *
 * 组合：trajectory-logger（记录）+ episode-indexer（双时态索引）+ retrieval-adapter（适配）。
 */

import { EpisodeIndexer } from './episode-indexer.js';
import { EpisodicRetrievalAdapter } from './retrieval-adapter.js';
import { TrajectoryLogger, type TrajectoryEvent } from './trajectory-logger.js';
import type { MemoryHit, MemoryQuery } from '../types.js';

export { EpisodeIndexer } from './episode-indexer.js';
export { EpisodicRetrievalAdapter } from './retrieval-adapter.js';
export { TrajectoryLogger } from './trajectory-logger.js';
export type { TrajectoryEvent } from './trajectory-logger.js';

/** 情景存储端口。 */
export interface EpisodicStorePort {
  record(event: Omit<TrajectoryEvent, 'id' | 'recordTime'>): TrajectoryEvent;
  queryByEventTime(traceId: string, from?: number, to?: number): readonly TrajectoryEvent[];
  retrieve(query: MemoryQuery): readonly MemoryHit[];
}

/**
 * 情景存储实现（内存桩）。
 * 任务链路结束 → 记录轨迹 → 建索引 → 供检索适配。
 */
export class EpisodicStore implements EpisodicStorePort {
  private readonly logger = new TrajectoryLogger();
  private readonly indexer = new EpisodeIndexer();
  private readonly adapter = new EpisodicRetrievalAdapter();

  record(event: Omit<TrajectoryEvent, 'id' | 'recordTime'>): TrajectoryEvent {
    const e = this.logger.append(event);
    this.indexer.index([e]);
    return e;
  }

  queryByEventTime(traceId: string, from?: number, to?: number): readonly TrajectoryEvent[] {
    return this.indexer.queryByEventTime(traceId, from, to);
  }

  retrieve(query: MemoryQuery): readonly MemoryHit[] {
    const range = query.eventTimeRange;
    const candidates = this.indexer.queryByRecordTime(range?.from, range?.to);
    return this.adapter.toHits(
      {
        events: candidates,
        // TODO(infra): 以向量/关键词混合检索替换朴素匹配
        scoreOf: (e) => (query.text ? textualMatch(e, query.text) : 0.5),
        salienceOf: (e) => (typeof e.payload === 'object' && e.payload !== null && 'salience' in e.payload
          ? Number((e.payload as { salience?: number }).salience ?? 0.5)
          : 0.5),
      },
      query.limit ?? 50,
      query.minScore ?? 0,
    );
  }
}

function textualMatch(e: TrajectoryEvent, text: string): number {
  const hay = JSON.stringify(e.payload ?? '').toLowerCase();
  return hay.includes(text.toLowerCase()) ? 1 : 0.2;
}
