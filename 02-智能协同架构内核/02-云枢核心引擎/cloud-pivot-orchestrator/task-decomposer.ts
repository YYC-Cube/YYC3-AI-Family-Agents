/**
 * 任务分解器（task-decomposer）—— CAGEERF 七阶段分解骨架。
 * 边界：只做结构分解；具体家人绑定与上下文填充归编排器。
 *
 * 阶段语义依据《docs/YYC3-AI-Family-Agent-架构设计.md》§5.7 建议稿：
 * Clarify / Analyze / Generate / Evaluate / Execute / Review / Finalize。
 * ⚠️ 建议稿待家族权威确权（确权后仅需校对本常量文案，阶段集合不变）。
 */

import type { CageerfStage, Intent, TaskPlan, TaskStep } from '../types.js';

/**
 * CAGEERF 七阶段（C-A-G-E-E-R-F，§5.7 建议稿）。
 */
export const CAGEERF_STAGES: readonly CageerfStage[] = [
  'clarify', //    C —— 澄清：意图澄清与上下文构建（千行）
  'analyze', //    A —— 分析：依赖/风险/资源/记忆检索（万物）
  'generate', //   G —— 生成：候选计划与家人分工（天枢/灵韵）
  'evaluate', //   E —— 评估：风险预测与质量择优（先知/宗师）
  'execute', //    E —— 执行：调度家人并贯穿策略护栏（天枢）
  'review', //     R —— 复核：自评+外验（verification-gateway）
  'finalize', //   F —— 固化：记忆写入/学习回流/交付呈现（伯乐）
];

/** CAGEERF 任务分解器。 */
export class TaskDecomposer {
  /**
   * 将意图分解为按 CAGEERF 阶段编排的任务步骤。
   * TODO(infra): 按意图类型选择参与家人，绑定 step.owner 与依赖关系。
   */
  decompose(intent: Intent): TaskPlan {
    const steps: TaskStep[] = CAGEERF_STAGES.map((stage, index) => ({
      id: `${intent.id}-s${index}`,
      stage,
      owner: '待编排',
      goal: `${stage} 阶段（TODO(infra): 绑定家人与目标）`,
    }));
    return { traceId: intent.traceId, intentId: intent.id, steps };
  }
}
