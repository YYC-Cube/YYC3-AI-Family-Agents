/**
 * A2A 适配层（a2a-adapter · P2-T2）—— barrel。
 * 职责：card 发现（well-known 映射 + 内存注册表）与任务委托（JSON-RPC 构造 + 归一 + DLQ）。
 * 边界：纯内存 stub，零网络；transport 注入；零运行时依赖。
 */

export * from './card-discovery.js';
export * from './task-delegate.js';
