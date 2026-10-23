/**
 * 情景索引器（episode-indexer）——「知」支柱 episodic-store 子模块。
 * 职责：对轨迹事件建立**双时态索引**（事件时间 eventTime + 记录时间 recordTime）。
 * 关键：支持"当时是什么样"（as-of）与"我们何时得知"（as-known）两类查询。
 *
 * TODO(infra): 生产环境用时间树（time-tree）/ 范围索引结构替换 O(n) 扫描。
 */

import type { TrajectoryEvent } from './trajectory-logger.js';

/** 索引键。 */
export interface EpisodeKey {
  readonly traceId: string;
  readonly id: string;
}

/**
 * 双时态索引器。
 * 以 traceId 分组，按 eventTime 排序；recordTime 用于回溯"入库延迟"。
 */
export class EpisodeIndexer {
  private readonly byTrace = new Map<string, TrajectoryEvent[]>();

  /** 建立/更新索引。 */
  index(events: readonly TrajectoryEvent[]): void {
    for (const e of events) {
      const bucket = this.byTrace.get(e.traceId) ?? [];
      bucket.push(e);
      bucket.sort((a, b) => a.eventTime - b.eventTime);
      this.byTrace.set(e.traceId, bucket);
    }
    // TODO(infra): 构建持久化双时态索引（B-tree / time-tree）
  }

  /**
   * 按事件时间窗检索。
   * @param from 起始事件时间（含）
   * @param to 结束事件时间（含）
   */
  queryByEventTime(traceId: string, from?: number, to?: number): readonly TrajectoryEvent[] {
    const bucket = this.byTrace.get(traceId) ?? [];
    return bucket.filter(
      (e) => (from === undefined || e.eventTime >= from) && (to === undefined || e.eventTime <= to),
    );
  }

  /** 按记录时间窗检索（审计视角：系统何时写入）。 */
  queryByRecordTime(from?: number, to?: number): readonly TrajectoryEvent[] {
    const out: TrajectoryEvent[] = [];
    for (const bucket of this.byTrace.values()) {
      for (const e of bucket) {
        if ((from === undefined || e.recordTime >= from) && (to === undefined || e.recordTime <= to)) {
          out.push(e);
        }
      }
    }
    return out;
  }
}
