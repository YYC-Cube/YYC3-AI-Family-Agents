/**
 * stability-guard（稳定性保障）——「学」支柱子模块入口（barrel）。
 * 「稳定性—可塑性」守门：退化检测 → 回归 → 失败回滚（对接 §5.5 自愈中心）。
 */

export * from './forgetting-detector.js';
export * from './regression-tester.js';
export * from './rollback-controller.js';
