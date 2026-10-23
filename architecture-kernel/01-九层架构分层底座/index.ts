/**
 * ============================================================
 * YYC³ AI Family — 九层架构分层底座 统一入口（barrel）。
 * ------------------------------------------------------------
 * 九层能力底座（L1–L9），对齐架构设计 §4 / §4.2：
 *   L1 基础底座   / L2 千里·伯乐 / L3 预见·先知 / L4 语枢·万物 /
 *   L5 言启·千行 / L6 创想·灵韵 / L7 格物·宗师 / L8 智云·守护 /
 *   L9 元启·天枢
 *
 * 说明：本目录只放"能力底座"（层级能力的抽象契约与编排入口）；
 *       具体家人业务实现位于 `family-agents/`，此处不 import 家人实现。
 * ============================================================
 */

export * from './types.js';
export * from './layer-1-foundation/index.js';
export * from './layer-2-bole/index.js';
export * from './layer-3-prophet/index.js';
export * from './layer-4-thinker/index.js';
export * from './layer-5-navigator/index.js';
export * from './layer-6-creative/index.js';
export * from './layer-7-master/index.js';
export * from './layer-8-guardian/index.js';
export * from './layer-9-meta-oracle/index.js';
