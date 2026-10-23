/**
 * 假设登记（assumption-tracker）——「自」支柱子组件。
 * 职责：**显式记录隐式假设**；异常/升级时暴露相关假设，支撑事后归因。
 * 边界：只登记与检索假设，不做判断。
 *
 * TODO(infra): 假设落库到情景记忆，供学习引擎回流为"高风险假设库"。
 */

import type { Assumption } from './types.js';

/** 带标识的可追踪假设。 */
export interface TrackedAssumption extends Assumption {
  id: string;
  /** 登记时间。 */
  recordedAt: number;
}

/** 假设登记器。 */
export class AssumptionTracker {
  private readonly assumptions: TrackedAssumption[] = [];
  private seq = 0;

  /** 登记一条隐式假设。 */
  record(assumption: Assumption, ts = Date.now()): TrackedAssumption {
    this.seq += 1;
    const tracked: TrackedAssumption = {
      ...assumption,
      id: `asm-${ts}-${this.seq}`,
      recordedAt: ts,
    };
    this.assumptions.push(tracked);
    // TODO(infra): 写入情景记忆（episodic），与 JudgmentSignal 关联
    return tracked;
  }

  /** 批量登记。 */
  recordAll(items: readonly Assumption[], ts = Date.now()): readonly TrackedAssumption[] {
    return items.map((a) => this.record(a, ts));
  }

  /** 当前会话登记的全部假设。 */
  all(): readonly TrackedAssumption[] {
    return this.assumptions;
  }

  /**
   * 暴露相关假设。
   * @param onAnomaly 是否处于异常/升级态；为 true 时优先暴露高风险假设。
   */
  relevant(onAnomaly: boolean): readonly TrackedAssumption[] {
    if (!onAnomaly) return this.all();
    const rank = { high: 0, med: 1, low: 2 } as const;
    return [...this.assumptions].sort((a, b) => rank[a.riskIfWrong] - rank[b.riskIfWrong]);
  }

  clear(): void {
    this.assumptions.length = 0;
  }
}
