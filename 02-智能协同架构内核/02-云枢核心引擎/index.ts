/**
 * ============================================================
 * YYC³ AI Family — 云枢核心引擎 统一入口（barrel）。
 * ------------------------------------------------------------
 * 云枢系统核心实现，对齐架构设计 §4：
 *   cloud-pivot-orchestrator  云枢编排器（任务分解 / 家人调度）
 *     └── verification-gateway 【自/治】自评-外验闭环（外部真值校验）
 *   family-communication-bus  家族通信总线（事件路由 / 链路追踪 / MCP 适配器）
 *   global-status-center      全局状态中心（全链路态势感知）
 *   family-phone-system       云枢电话系统（通讯录 / 通话 / 私信）
 *   dashu-self-healing        【愈】自愈控制器（K8s 扩缩 / 降级 / 回滚，对接 07-自愈中心）
 *
 * 全局数据流排序与两处争论点处置见 types.ts 文件头注释（§4.2 / §5.6）。
 * ============================================================
 */

export * from './types.js';
export * from './cloud-pivot-orchestrator/index.js';
export * from './family-communication-bus/index.js';
export * from './global-status-center/index.js';
export * from './family-phone-system/index.js';
export * from './dashu-self-healing/index.js';
