/**
 * 偏离检测（deviation-detector）——「自」支柱子组件。
 * 职责：运行时把**实际行为轨迹**与**程序记忆标准模式**比较，超阈值告警。
 * 边界：只检测偏离并上报；修复归自愈中心（§5.5）。
 *
 * TODO(infra): 引入语义等价判定（避免措辞差异误报）+ 模式版本选择器。
 */

import type { BehaviorTrace, DeviationReport, StandardPattern } from './types.js';

/** 偏离阈值配置。 */
export interface DeviationThresholds {
  /** 相似度低于此值 → med。 */
  medBelow: number;
  /** 相似度低于此值 → high。 */
  highBelow: number;
}

export const DEFAULT_DEVIATION_THRESHOLDS: DeviationThresholds = {
  medBelow: 0.75,
  highBelow: 0.5,
};

/** 偏离检测器。 */
export class DeviationDetector {
  constructor(private readonly thresholds: DeviationThresholds = DEFAULT_DEVIATION_THRESHOLDS) {}

  /** 比较实际轨迹与标准模式；无显著偏离返回 undefined。 */
  detect(actual: BehaviorTrace, expected: StandardPattern): DeviationReport | undefined {
    const sim = similarity(actual.steps, expected.steps);
    if (sim >= this.thresholds.medBelow) return undefined;
    const severity: DeviationReport['severity'] = sim < this.thresholds.highBelow ? 'high' : 'med';
    return {
      severity,
      expected: expected.steps.join(' → '),
      actual: actual.steps.join(' → '),
    };
    // TODO(infra): 用语义等价 + 关键步骤对齐，替代纯序列相似度
  }
}

/** 序列相似度（基于归一化编辑距离）。 */
function similarity(a: readonly string[], b: readonly string[]): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Levenshtein 距离（最小桩实现）。 */
function levenshtein(a: readonly string[], b: readonly string[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i]![0] = i;
  for (let j = 0; j <= n; j += 1) dp[0]![j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[m]![n]!;
}
