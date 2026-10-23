/**
 * cloud-pivot-orchestrator（云枢编排器）入口（barrel）。
 * 含 verification-gateway 子模块（§5.2 自评-外验闭环）。
 */

export * from './orchestrator.js';
export * from './task-decomposer.js';
export * from './verification-gateway/index.js';
