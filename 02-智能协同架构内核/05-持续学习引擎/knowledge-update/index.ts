/**
 * knowledge-update（知识更新）——「学」支柱子模块入口（barrel）。
 * 职责：语义冲突/过时检测 → 用户偏好渐进更新 → 行为规则演化（对接程序记忆）。
 */

export * from './semantic-diff.js';
export * from './preference-tracker.js';
export * from './rule-evolution.js';
