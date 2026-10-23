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

/** CAGEERF 阶段 → 承接家人（编号与家人注册表一致）。 */
const STAGE_OWNER: Readonly<Record<CageerfStage, string>> = {
  clarify: '010301-01', // 言启·千行
  analyze: '010301-02', // 语枢·万物
  generate: '010301-05', // 元启·天枢
  evaluate: '010301-06', // 格物·宗师
  execute: '010301-05', // 元启·天枢
  review: '010301-06', // 格物·宗师（联合 verification-gateway）
  finalize: '010301-04', // 千里·伯乐
};

/** 阶段目标文案（含意图话语，便于审计回溯）。 */
function goalOf(stage: CageerfStage, utterance: string): string {
  switch (stage) {
    case 'clarify':
      return `澄清意图与上下文：${utterance}`;
    case 'analyze':
      return '分析依赖/风险/资源，并检索相关记忆';
    case 'generate':
      return '生成候选计划与家人分工';
    case 'evaluate':
      return '评估风险与质量，择优执行方案';
    case 'execute':
      return '按计划调度家人，贯穿策略护栏';
    case 'review':
      return '自评 + 外验复核（verification-gateway）';
    case 'finalize':
      return '固化记忆、回流学习并由伯乐交付呈现';
    default:
      return stage;
  }
}

/** CAGEERF 任务分解器。 */
export class TaskDecomposer {
  /**
   * 将意图分解为按 CAGEERF 阶段编排的任务步骤。
   * 每步绑定 owner 与前置依赖（线性链），goal 携带意图话语便于审计。
   */
  decompose(intent: Intent): TaskPlan {
    const steps: TaskStep[] = CAGEERF_STAGES.map((stage, index) => {
      const id = `${intent.id}-s${index}`;
      const prev = index > 0 ? `${intent.id}-s${index - 1}` : undefined;
      return {
        id,
        stage,
        owner: STAGE_OWNER[stage],
        goal: goalOf(stage, intent.utterance),
        ...(prev ? { dependsOn: [prev] } : {}),
      };
    });
    return { traceId: intent.traceId, intentId: intent.id, steps };
  }
}
