/**
 * 言启·千行 · 自我判断层（self-judge）——「自」支柱，agent-level 实例化。
 * 该文件演示：以 SelfJudge 为意图分类任务配置专属判断策略。
 *
 * ⚠️ 红线：自我判断不得脱离外部世界状态，必须与
 *    verification-gateway.ground-truth-checker 联合校准（防「进展海市蜃楼」）。
 *
 * v2.3.0（Phase B）：本模块产出的 JudgmentSignal 交由
 *    02-云枢核心引擎/.../verification-gateway/gateway.ts 的
 *    VerificationGateway.adjudicate() 做真值比对/交叉验证/置信度校准，
 *    闭环门禁见 tests/integration/self-judge-verification.spec.ts。
 */

import {
  SelfJudge,
  type Assumption,
  type BehaviorTrace,
  type Candidate,
  type JudgmentSignal,
  type StandardPattern,
} from '@shared/self-judge-kit';

/** 千行意图分类的判断输入（按需组装）。 */
export interface QianhangJudgeInput {
  agent: string;
  taskType: string;
  text: string;
  candidates: readonly Candidate[];
  traceId: string;
  /** 实际分类路径（用于偏离检测）。 */
  actualBehavior?: BehaviorTrace;
  /** 程序记忆标准模式（procedural/intent-rules.yaml 提炼）。 */
  expectedPattern?: StandardPattern;
}

/**
 * 千行专属 SelfJudge 配置。
 * tauLow 略高于默认（0.6 → 0.65）：意图之门是家族入口，宁可多问一句也不误判。
 */
export const QIANHANG_JUDGMENT_CONFIG = {
  tauLow: 0.65,
  tauHigh: 0.9,
} as const;

/** 千行的 SelfJudge 单例工厂（每个 traceId 建议独立实例以隔离假设台账）。 */
export function createQianhangSelfJudge(): SelfJudge {
  return new SelfJudge({ config: { ...QIANHANG_JUDGMENT_CONFIG } });
}

/** 默认 SelfJudge 实例（无状态判断场景复用）。 */
export const qianhangSelfJudge = createQianhangSelfJudge();

/**
 * 从文本启发式提取隐式假设（桩）。
 * 例：输入含"这个/那个"等指代 → 登记歧义假设。
 */
export function extractAssumptions(text: string): Assumption[] {
  const out: Assumption[] = [];
  if (/这个|那个|它|他|她/.test(text)) {
    out.push({
      statement: '用户指代对象可由上文唯一确定',
      basis: '对话上下文存在先行词',
      riskIfWrong: 'high',
    });
  }
  if (text.length > 0 && text.length < 4) {
    out.push({
      statement: '过短输入包含足够意图信息',
      basis: '短输入常见于追问',
      riskIfWrong: 'med',
    });
  }
  return out;
}

/**
 * 意图分类判断入口（供 intent-classifier 调用）。
 * 组合候选打分 + 假设提取 + 偏离检测 + 升级决策 → JudgmentSignal。
 */
export function judgeIntent(
  judge: SelfJudge,
  input: QianhangJudgeInput,
): JudgmentSignal {
  return judge.judge({
    agent: input.agent,
    taskType: input.taskType,
    candidates: [...input.candidates],
    assumptions: extractAssumptions(input.text),
    uncertaintySources: deriveUncertainty(input),
    actualBehavior: input.actualBehavior,
    expectedPattern: input.expectedPattern,
  });
}

/** 派生不确定性来源（桩）。 */
function deriveUncertainty(input: QianhangJudgeInput): string[] {
  const sources: string[] = [];
  if (input.text.trim().length === 0) sources.push('空输入');
  if (input.candidates.length === 0) sources.push('无候选意图命中');
  if (input.candidates.length > 1) {
    const sorted = [...input.candidates].sort((a, b) => b.score - a.score);
    const margin = (sorted[0]?.score ?? 0) - (sorted[1]?.score ?? 0);
    if (margin < 0.15) sources.push('候选意图间隔过小（用户输入歧义性）');
  }
  return sources;
}
