/**
 * 总线-轨迹桥接器（trajectory-bridge）—— infra 集成位 1（§6.4）。
 * 职责：订阅 family-communication-bus 的 `task.executed` 主题，把总线事件载荷
 *       转换为 TrajectoryEvent 并采集进「学」支柱经验回流管道（TrajectoryCollector）。
 * 边界：只做协议转换与投递；标注归 outcome-labeler，学习由 learning-loop.runCycle 显式触发。
 *
 * v2.5.0（infra-1）实装：
 *   - 幂等由总线保证（traceId:agentId:seq 去重，重复事件不会到达本桥）；
 *   - 载荷缺失必需字段的事件被拒收并计数（可观测，不抛错——桥接层不阻塞总线）；
 *   - traceId 从幂等键注入轨迹，保证「自→治→学」三环链路贯穿。
 * TODO(infra): EventBus 提供 unsubscribe 后把 detach 落地为真实解绑；背压/断点续采。
 */

import type { TrajectoryCollectorPort, TrajectoryEvent } from '../../05-持续学习引擎/experience-reflow/trajectory-collector.js';
import type { BusEvent } from '../types.js';

/** `task.executed` 主题载荷契约（总线侧 → 学习侧）。 */
export interface TaskExecutedPayload {
  readonly agent: string;
  readonly taskType: string;
  readonly steps: readonly { readonly order: number; readonly action: string; readonly tool?: string; readonly ok: boolean }[];
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly completed: boolean;
}

/** 桥接统计（可观测）。 */
export interface BridgeStats {
  readonly accepted: number;
  readonly rejected: number;
}

/** 桥接事件观察者（v2.7.0 埋点：bus → collector 的每一次受理/拒收）。 */
export type BridgeObserver = (event: BusEvent, accepted: boolean) => void;

/** 总线-轨迹桥接器。 */
export class TrajectoryBridge {
  private accepted = 0;
  private rejected = 0;

  constructor(
    private readonly collector: TrajectoryCollectorPort,
    private readonly topic = 'task.executed',
    private readonly onEvent?: BridgeObserver,
  ) { }

  /** 挂载到总线：订阅主题并开始桥接。 */
  attach(bus: { readonly subscribe: (topic: string, handler: (event: BusEvent) => void | Promise<void>) => void }): void {
    bus.subscribe(this.topic, (event) => {
      this.handle(event);
    });
  }

  /** 单事件转换 + 采集（供测试与直连）。返回是否被受理。 */
  handle(event: BusEvent): boolean {
    const trajectory = this.toTrajectoryEvent(event);
    if (!trajectory) {
      this.rejected += 1;
      this.onEvent?.(event, false);
      return false;
    }
    this.collector.collect(trajectory);
    this.accepted += 1;
    this.onEvent?.(event, true);
    return true;
  }

  /** 桥接统计。 */
  get stats(): BridgeStats {
    return { accepted: this.accepted, rejected: this.rejected };
  }

  /**
   * BusEvent → TrajectoryEvent 转换。
   * 缺失必需字段的载荷返回 undefined（拒收）；startedAt/finishedAt 缺省回退事件时间。
   */
  toTrajectoryEvent(event: BusEvent): TrajectoryEvent | undefined {
    const p = event.payload as Partial<TaskExecutedPayload> | undefined;
    if (
      !p ||
      typeof p.agent !== 'string' ||
      typeof p.taskType !== 'string' ||
      !Array.isArray(p.steps) ||
      typeof p.completed !== 'boolean'
    ) {
      return undefined;
    }
    return {
      traceId: event.key.traceId,
      agent: p.agent,
      taskType: p.taskType,
      steps: p.steps,
      startedAt: typeof p.startedAt === 'number' ? p.startedAt : event.at,
      finishedAt: typeof p.finishedAt === 'number' ? p.finishedAt : event.at,
      completed: p.completed,
      metadata: { topic: event.topic, agentId: event.key.agentId, seq: event.key.seq },
    };
  }
}
