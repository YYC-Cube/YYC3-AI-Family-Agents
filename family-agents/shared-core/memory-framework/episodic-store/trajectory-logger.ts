/**
 * 轨迹记录器（trajectory-logger）——「知」支柱 episodic-store 子模块。
 * 职责：记录任务执行链路（事件），保留事件时间与记录时间的双时态。
 * 边界：只追加事件，不做索引与检索（分别归 episode-indexer / retrieval-adapter）。
 *
 * TODO(infra): 落地为 append-only 事件表 + 对象存储冷备（关系库 + OSS）。
 */

/** 轨迹事件（双时态）。 */
export interface TrajectoryEvent {
  readonly id: string;
  readonly traceId: string;
  readonly agent: string;
  /** 事件时间：业务实际发生时刻。 */
  readonly eventTime: number;
  /** 记录时间：系统写入时刻（稽核用）。 */
  readonly recordTime: number;
  readonly type: string;
  readonly payload: unknown;
}

/** 轨迹记录器端口。 */
export interface TrajectoryLoggerPort {
  append(event: Omit<TrajectoryEvent, 'id' | 'recordTime'>): TrajectoryEvent;
  byTrace(traceId: string): readonly TrajectoryEvent[];
  all(): readonly TrajectoryEvent[];
}

/**
 * 轨迹记录器（内存桩）。
 * 任务链路结束（task.completed）后由 memory-orchestrator 批量持久化。
 */
export class TrajectoryLogger implements TrajectoryLoggerPort {
  private readonly events: TrajectoryEvent[] = [];
  private seq = 0;

  append(event: Omit<TrajectoryEvent, 'id' | 'recordTime'>): TrajectoryEvent {
    this.seq += 1;
    const record: TrajectoryEvent = {
      ...event,
      id: `ep-${event.traceId}-${this.seq}`,
      recordTime: Date.now(),
    };
    this.events.push(record);
    // TODO(infra): 追加写入 append-only 事件表（关系库），并镜像至对象存储
    return record;
  }

  byTrace(traceId: string): readonly TrajectoryEvent[] {
    return this.events.filter((e) => e.traceId === traceId);
  }

  all(): readonly TrajectoryEvent[] {
    return this.events;
  }
}
