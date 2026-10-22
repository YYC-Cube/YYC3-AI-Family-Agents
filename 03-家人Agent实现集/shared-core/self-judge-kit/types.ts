/**
 * ============================================================
 * YYC³ AI Family — 自我判断套件（「自」支柱）核心类型定义
 * ------------------------------------------------------------
 * 文档依据：YYC3-AI-Family-Agent-架构设计.md §5.2
 * 边界：负责输出置信度、假设登记、行为偏离检测、升级/求助决策；
 *       不负责外部真值校验（归 verification-gateway）、最终裁决（归天枢/人类）。
 *
 * ⚠️ 红线（对齐 §5.2）：自我判断**不得脱离外部世界状态**。
 *    confidence-scorer 的输出必须与 verification-gateway.ground-truth-checker
 *    的校验结果联合校准，否则视为「进展海市蜃楼」高危。
 * ============================================================
 */

/** 隐式假设（显式登记，供异常时暴露）。 */
export interface Assumption {
  statement: string;
  basis: string;
  riskIfWrong: 'low' | 'med' | 'high';
}

/** 行为偏离报告（实际 vs 程序记忆标准模式）。 */
export interface DeviationReport {
  severity: 'low' | 'med' | 'high';
  expected: string;
  actual: string;
}

/** 自我判断信号（§5.2 结构化输出，字段严格对齐）。 */
export interface JudgmentSignal {
  agent: string;
  /** 校准后的置信度 0–1。 */
  confidence: number;
  /** 不确定性来源，如 ["用户输入歧义性"]。 */
  uncertaintySources: string[];
  /** 可能的替代假设/替代意图。 */
  alternativeHypotheses?: string[];
  /** 显式登记的隐式假设。 */
  assumptions: Assumption[];
  /** 与程序记忆标准模式的偏离（可选）。 */
  deviation?: DeviationReport;
  /** 升级决策。 */
  escalation: 'none' | 'cross-validate' | 'human-confirm';
}

/** 判断配置（默认 tauLow = 0.6）。 */
export interface JudgmentConfig {
  /** 低置信阈值。 */
  tauLow: number;
  /** 高置信阈值（校准上限）。 */
  tauHigh: number;
}

/** 默认配置。 */
export const DEFAULT_JUDGMENT_CONFIG: JudgmentConfig = {
  tauLow: 0.6,
  tauHigh: 0.85,
};

/** 升级决策（含触发原因，可观测）。 */
export interface ElevationDecision {
  escalation: 'none' | 'cross-validate' | 'human-confirm';
  reason: string;
  triggeredBy: ('low-confidence' | 'high-deviation')[];
}

/** 候选结论（意图分类/分析等产出候选）。 */
export interface Candidate {
  label: string;
  /** 原始打分 0–1（可由 LLM logprob / 规则权重给出）。 */
  score: number;
  rationale?: string;
}

/** 判断输入（供 SelfJudge.judge 消费）。 */
export interface JudgmentInput {
  agent: string;
  taskType: string;
  candidates: Candidate[];
  /** 依赖的隐式假设（显式传入）。 */
  assumptions?: Assumption[];
  /** 已知的不确定性来源。 */
  uncertaintySources?: string[];
  /** 实际行为轨迹。 */
  actualBehavior?: BehaviorTrace;
  /** 程序记忆中的标准模式。 */
  expectedPattern?: StandardPattern;
}

/** 行为轨迹（实际执行步骤）。 */
export interface BehaviorTrace {
  steps: string[];
}

/** 标准模式（来自程序记忆，可版本化）。 */
export interface StandardPattern {
  id: string;
  version?: string;
  steps: string[];
}
