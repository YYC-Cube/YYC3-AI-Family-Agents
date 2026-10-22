/**
 * ============================================================
 * YYC³ AI Family — 持续学习引擎（「学」支柱）统一入口（barrel）。
 * ------------------------------------------------------------
 * 五大子模块：
 *   experience-reflow    经验回流（轨迹采集 → 结果标注 → 模式提炼）
 *   skill-consolidation  技能巩固（固化 / 淘汰 / 版本化）
 *   knowledge-update     知识更新（语义差异 / 偏好追踪 / 规则演化）
 *   stability-guard      稳定性保障（退化检测 / 回归 / 回滚）
 *   learning-scheduler   学习调度（优先级队列 / 资源配额）
 *
 * ⚠️ 稳定性—可塑性约束（§5.3，必选）：
 *   任何新学习必须经 forgetting-detector 检查退化，冲突触发 regression-tester，
 *   失败则 rollback-controller 回滚（对接 §5.5 自愈中心）。
 * ============================================================
 */

export * from './types.js';
export * from './learning-loop.js';
export * from './experience-reflow/index.js';
export * from './skill-consolidation/index.js';
export * from './knowledge-update/index.js';
export * from './stability-guard/index.js';
export * from './learning-scheduler/index.js';
