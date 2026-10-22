/**
 * 置信度评分（confidence-scorer）——「自」支柱子组件。
 * 职责：输出**结构化**置信度（含不确定性来源与替代假设）。
 * 边界：只做打分与校准；外部真值校验归 verification-gateway。
 *
 * ⚠️ 红线：本组件输出必须与 ground-truth-checker 联合校准，防「进展海市蜃楼」。
 *
 * TODO(infra): 以温度缩放（temperature scaling）/ 保序回归做校准，
 *              目标校准误差 < 0.15（见 §6.4 Phase B）。
 */

import type { Candidate } from './types.js';

/** 置信度评分输入。 */
export interface ConfidenceInput {
  agent: string;
  taskType: string;
  candidates: Candidate[];
  /** 已知的不确定性来源（用户输入歧义 / 数据缺失 / 上下文不足等）。 */
  uncertaintySources?: string[];
  /** 判断依据（供生成替代假设）。 */
  context?: Readonly<Record<string, unknown>>;
}

/** 置信度评分结果。 */
export interface ConfidenceResult {
  /** 校准后置信度 0–1。 */
  confidence: number;
  /** 最高候选的原始打分。 */
  rawTop: number;
  /** 与次高候选的间隔（margin）。 */
  margin: number;
  /** 不确定性来源（原样透出 + 派生）。 */
  uncertaintySources: string[];
  /** 替代假设（除最高候选外的候选标签）。 */
  alternativeHypotheses: string[];
}

/** 置信度评分器。 */
export class ConfidenceScorer {
  constructor(private readonly config: { temperature?: number; maxAlternatives?: number } = {}) {}

  /** 输出结构化置信度评分。 */
  score(input: ConfidenceInput): ConfidenceResult {
    const sorted = [...input.candidates].sort((a, b) => b.score - a.score);
    const top = sorted[0];
    const second = sorted[1];
    const rawTop = top?.score ?? 0;
    const margin = top && second ? Math.max(0, top.score - second.score) : rawTop;

    // 基础置信度：top 打分与 margin 的加权（margin 越大越可信）
    const base = 0.7 * rawTop + 0.3 * Math.min(1, margin / 0.3);
    // 不确定性惩罚：来源越多，置信度越低
    const sources = [...(input.uncertaintySources ?? [])];
    if (sorted.length === 0) sources.push('无候选结论');
    const penalty = Math.min(0.4, sources.length * 0.08);

    const calibrated = this.calibrate(clamp01(base - penalty));

    return {
      confidence: calibrated,
      rawTop,
      margin,
      uncertaintySources: dedupe(sources),
      alternativeHypotheses: sorted
        .slice(1, 1 + (this.config.maxAlternatives ?? 3))
        .map((c) => c.label),
    };
    // TODO(infra): 以真值反馈做温度缩放/保序回归，替换启发式校准
  }

  /** 温度缩放（桩：恒等映射，保留接口）。 */
  private calibrate(p: number): number {
    const t = this.config.temperature ?? 1;
    if (t === 1) return p;
    // 简化温度缩放：logit 变换后按 T 缩放再 sigmoid
    const eps = 1e-6;
    const clamped = Math.min(1 - eps, Math.max(eps, p));
    const logit = Math.log(clamped / (1 - clamped));
    return 1 / (1 + Math.exp(-logit / t));
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function dedupe(arr: readonly string[]): string[] {
  return [...new Set(arr)];
}
