/**
 * 轨迹采集（trajectory-collector）——「学」支柱 experience-reflow 子模块。
 * 职责：从通信总线（family-communication-bus）订阅 task.executed 链路，采集任务轨迹。
 * 边界：只采集与结构化；标注归 outcome-labeler，模式提炼归 pattern-extractor。
 *
 * v2.4.0（Phase C）：支持 judgment 信号随链路关联入库（低置信但成功 → 高价值素材）；
 *   采集接口保持被动调用形态，由部署侧把总线事件桥接到 collect()。
 * TODO(infra): 总线事件桥接器（MCP 适配器）、背压/断点续采。
 */

import type { TaskTrajectory, TrajectoryStep } from '../types.js';
import type { JudgmentSignal } from '@shared/self-judge-kit';

/** 总线轨迹事件（从 task.executed 链路解析）。 */
export interface TrajectoryEvent {
  readonly traceId: string;
  readonly agent: string;
  readonly taskType: string;
  readonly steps: readonly TrajectoryStep[];
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly completed: boolean;
  /** 自评信号（与该链路关联，可选）。 */
  readonly judgment?: JudgmentSignal;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** 轨迹采集器端口。 */
export interface TrajectoryCollectorPort {
  collect(event: TrajectoryEvent): TaskTrajectory;
  /** 取出并清空已采集轨迹（仅供下游批量消费）。 */
  drain(): readonly TaskTrajectory[];
  /** 当前缓冲量（供观测）。 */
  size(): number;
}

/** 轨迹采集器（内存缓冲；生产环境替换为持久化队列）。 */
export class TrajectoryCollector implements TrajectoryCollectorPort {
  private readonly buffer: TaskTrajectory[] = [];

  collect(event: TrajectoryEvent): TaskTrajectory {
    const trajectory: TaskTrajectory = {
      traceId: event.traceId,
      agent: event.agent,
      taskType: event.taskType,
      steps: event.steps,
      startedAt: event.startedAt,
      finishedAt: event.finishedAt,
      completed: event.completed,
      judgment: event.judgment,
      metadata: event.metadata,
    };
    this.buffer.push(trajectory);
    return trajectory;
  }

  drain(): readonly TaskTrajectory[] {
    const out = [...this.buffer];
    this.buffer.length = 0;
    return out;
  }

  size(): number {
    return this.buffer.length;
  }
}
