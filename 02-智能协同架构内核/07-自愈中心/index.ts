/**
 * ============================================================
 * YYC³ AI Family — 自愈中心（「愈」支柱）统一入口（barrel）。
 * ------------------------------------------------------------
 * 四大子模块：
 *   fault-detector         故障侦测（基础设施/模型/总线/记忆/学习/判断）
 *   degradation-controller 降级 / 熔断
 *   rollback-controller    技能版本回滚 / 灰度回滚
 *   consistency-repair     记忆跨层不一致快照修复
 *
 * 自愈层级矩阵与 RTO/RPO 目标见 types.ts 的
 * HEALING_LAYER_MATRIX 与 RTO_RPO_TARGETS（§5.5）。
 * ============================================================
 */

export * from './types.js';
export * from './fault-detector/index.js';
export * from './degradation-controller/index.js';
export * from './rollback-controller/index.js';
export * from './consistency-repair/index.js';
