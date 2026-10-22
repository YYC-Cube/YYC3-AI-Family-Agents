/**
 * verification-gateway（自评-外验闭环 / 外部真值校验）入口（barrel）。
 * 依据 §5.2 / §5.6：自评必须经外部真值校验，否则不生效（防「进展海市蜃楼」）。
 * 组件：oracle-registry / ground-truth-checker / cross-validator /
 *      confidence-calibrator / consistency-metrics / gateway（闭环门面）。
 */

export * from './oracle-registry.js';
export * from './ground-truth-checker.js';
export * from './cross-validator.js';
export * from './confidence-calibrator.js';
export * from './consistency-metrics.js';
export * from './gateway.js';
