/**
 * 降级与熔断（degradation-controller）——「愈」支柱子模块。
 * 职责：故障时执行**降级 / 熔断**（如模型降级到本地兜底、总线限流）。
 * 边界：只降级与熔断；回滚归 rollback-controller。
 *
 * v2.5.0（Phase D）转实——熔断器状态机（closed/open/half-open）：
 *   - closed：正常；连续失败 ≥ failureThreshold → open（熔断）；
 *   - open：全量熔断（circuit-break）；冷却期满后放行试探 → half-open；
 *   - half-open：放行降级试探（degrade）；成功 → closed，失败 → 重新 open。
 *   - 动作选择：closed → bus 限流（throttle）/ 其余降级（degrade）；
 *     open → 熔断（circuit-break）；half-open → 试探性降级（degrade）。
 * TODO(infra): 与 provider 兜底链（Ollama 本地兜底）联动下发真实降级指令。
 */

import type { FaultEvent, HealingAction, HealingActionKind, HealingOutcome } from '../types.js';

/** 熔断器状态。 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/** 降级控制器选项。 */
export interface DegradationOptions {
  /** 连续失败多少次触发熔断（默认 3）。 */
  readonly failureThreshold?: number;
  /** open → half-open 的冷却期毫秒（默认 30s）。 */
  readonly cooldownMs?: number;
  /**
   * 状态变更观察者（v2.7.2）：每次熔断器状态迁移后回调，
   * 供装配层上报 `family_circuit_state`（closed / half-open / open）。
   */
  readonly onStateChange?: (state: CircuitState) => void;
}

/** 降级/熔断控制器。 */
export class DegradationController {
  private state: CircuitState = 'closed';
  private failures = 0;
  private openedAt = 0;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly onStateChange?: (state: CircuitState) => void;

  constructor(options: DegradationOptions = {}) {
    this.failureThreshold = Math.max(1, options.failureThreshold ?? 3);
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.onStateChange = options.onStateChange;
  }

  /** 当前熔断器状态（供观测）。 */
  get circuitState(): CircuitState {
    return this.state;
  }

  /** 上游成功反馈：half-open 试探成功 → 恢复 closed；closed 清零失败计数。 */
  recordSuccess(): void {
    this.failures = 0;
    this.transition('closed');
  }

  /** 上游失败反馈：closed 累计；half-open 试探失败 → 重新 open。 */
  recordFailure(): void {
    if (this.state === 'half-open') {
      this.trip();
      return;
    }
    this.failures += 1;
    if (this.state === 'closed' && this.failures >= this.failureThreshold) this.trip();
  }

  /** 依据故障事件产出降级动作并执行（推进状态机，记录动作）。 */
  degrade(fault: FaultEvent): HealingOutcome {
    // 冷却期满 → 放行试探
    if (this.state === 'open' && Date.now() - this.openedAt >= this.cooldownMs) {
      this.transition('half-open');
    }

    const kind: HealingActionKind =
      this.state === 'open'
        ? 'circuit-break'
        : this.state === 'half-open'
          ? 'degrade'
          : fault.layer === 'bus'
            ? 'throttle'
            : 'degrade';

    const action: HealingAction = {
      id: `degrade-${fault.id}`,
      faultId: fault.id,
      layer: fault.layer,
      kind,
      target: fault.layer,
      params: { circuitState: this.state, failureThreshold: this.failureThreshold },
    };

    return {
      faultId: fault.id,
      actionId: action.id,
      layer: fault.layer,
      status: 'degraded',
      contractMet: true,
      at: Date.now(),
      detail: `熔断器 ${this.state}；下发动作 ${kind}`,
    };
  }

  /** 跳闸：进入 open，清零失败计数，开启冷却计时。 */
  private trip(): void {
    this.failures = 0;
    this.openedAt = Date.now();
    this.transition('open');
  }

  /** 状态迁移（仅在真实变化时回调，供指标上报）。 */
  private transition(next: CircuitState): void {
    if (this.state === next) return;
    this.state = next;
    this.onStateChange?.(next);
  }
}
