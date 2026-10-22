/**
 * experience-reflow（经验回流）——「学」支柱子模块入口（barrel）。
 * 数据流：总线采集轨迹 → 结果标注 → 模式提炼（不依赖人工标注，见 §5.3）。
 */

export * from './trajectory-collector.js';
export * from './outcome-labeler.js';
export * from './pattern-extractor.js';
