/**
 * 故障侦测（fault-detector）——「愈」支柱子模块。
 * 职责：侦测**基础设施 / 模型服务 / 总线 / 记忆 / 学习 / 判断**各层故障。
 * 边界：只侦测与分类；降级归 degradation-controller，回滚归 rollback-controller，
 *       一致性修复归 consistency-repair。
 *
 * v2.5.0（Phase D）转实：
 *   - 去抖窗口：同 (layer, type) 信号在 windowMs 内累计 ≥ debounceCount 次才升级为 FaultEvent
 *     （单次毛刺不触发自愈动作，防抖动）；触发后窗口重开；
 *   - 严重度按超出比率映射：ratio = observed/threshold
 *     （≥2 critical / ≥1.5 high / ≥1.2 med / 其余 low）；
 *   - 信号回落（observed ≤ threshold）即清零窗口。
 * TODO(infra): 接入 Prometheus/日志/链路追踪多源信号（§6.3）做跨信号聚合关联。
 */

import { HEALING_LAYER_MATRIX } from '../types.js';
import type { FaultEvent, HealingLayer } from '../types.js';

/** 侦测信号（来自可观测性体系 §6.3）。 */
export interface DetectionSignal {
  readonly layer: HealingLayer;
  readonly type: string;
  /** 观测值（如积压量 / 错误率 / 不一致数）。 */
  readonly observed: number;
  /** 阈值。 */
  readonly threshold: number;
  readonly traceId?: string;
}

/** 侦测器选项。 */
export interface FaultDetectorOptions {
  /** 升级为故障所需的窗口内最少超阈次数（默认 2；1 = 立即上报）。 */
  readonly debounceCount?: number;
  /** 去抖窗口毫秒（默认 30s）。 */
  readonly windowMs?: number;
}

/** 故障侦测器。 */
export class FaultDetector {
  private readonly windows = new Map<string, { count: number; firstAt: number }>();
  private seq = 0;
  private readonly debounceCount: number;
  private readonly windowMs: number;

  constructor(options: FaultDetectorOptions = {}) {
    this.debounceCount = Math.max(1, options.debounceCount ?? 2);
    this.windowMs = options.windowMs ?? 30_000;
  }

  /** 将超阈信号做去抖后转为故障事件（未超阈 / 未达去抖阈值返回 undefined）。 */
  detect(signal: DetectionSignal): FaultEvent | undefined {
    const key = `${signal.layer}:${signal.type}`;
    const now = Date.now();

    if (signal.observed <= signal.threshold) {
      this.windows.delete(key); // 信号回落即清零
      return undefined;
    }

    const prev = this.windows.get(key);
    const inWindow = prev !== undefined && now - prev.firstAt <= this.windowMs;
    const count = inWindow ? prev!.count + 1 : 1;
    this.windows.set(key, count === 1 ? { count: 1, firstAt: now } : { count, firstAt: prev!.firstAt });
    if (count < this.debounceCount) return undefined;
    this.windows.delete(key); // 触发后重开窗口

    this.seq += 1;
    const ratio = signal.observed / signal.threshold;
    const severity: FaultEvent['severity'] =
      ratio >= 2 ? 'critical' : ratio >= 1.5 ? 'high' : ratio >= 1.2 ? 'med' : 'low';
    return {
      id: `fault-${signal.layer}-${signal.type}-${this.seq}`,
      layer: signal.layer,
      type: signal.type,
      severity,
      detail:
        `${HEALING_LAYER_MATRIX[signal.layer].faultType}：观测值 ${signal.observed} 超阈值 ${signal.threshold}` +
        `（${(ratio * 100).toFixed(0)}%），窗口内第 ${count} 次超阈（去抖 ${this.debounceCount}）`,
      detectedAt: now,
      traceId: signal.traceId,
    };
  }
}
