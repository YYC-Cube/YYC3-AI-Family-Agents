/**
 * 能力供给计数（capability-supply）—— P3-T6 单一事实源。
 * 职责：从 manifest（技能/工具来源）与 plugins/ 目录（能力包）统计面板
 *       「能力供给」卡片三元组 {skills, tools, plugins}，并派生 MCP 工具名。
 * 口径：
 *   - skills = manifest 技能总数（含 planned，当前 45）；
 *   - tools  = active 技能映射的 MCP 工具数（planned 未准入不可见，对齐 P4-T5 语义）；
 *   - plugins= plugins/{id}/plugin.yaml 能力包数（P4 未实施，目录缺失 = 0）。
 * 消费方：scripts/run-regression.mjs（data.json.capabilities + 面板卡片）
 *        与 tests/contracts/capability-supply.contract.ts（同源交叉验证）。
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { loadManifest } from './family-manifest.mjs';

/** 能力包目录（P4 分发层落点；缺失视为 0）。 */
export const PLUGINS_DIR = 'plugins';

/**
 * 统一 id → MCP 工具名：`.` → `__`，`-` → `_`（MCP 要求 ^[a-zA-Z0-9_-]+$）。
 * 示例：qianhang.intent-detection → qianhang__intent_detection。
 */
export function toMcpToolName(logicalId) {
  return logicalId.replace('.', '__').replace(/-/g, '_');
}

/** 扫描 plugins/ 下的能力包数量（{id}/plugin.yaml 存在即计 1）。 */
export function countPlugins(root) {
  const dir = path.join(root, PLUGINS_DIR);
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { withFileTypes: true }).filter(
    (e) => e.isDirectory() && existsSync(path.join(dir, e.name, 'plugin.yaml')),
  ).length;
}

/**
 * 统计能力供给三元组（纯只读，不写盘、不联网）。
 * @returns {{skills: number, activeSkills: number, tools: number, plugins: number, toolNames: string[]}}
 */
export function countCapabilitySupply(root) {
  const manifest = loadManifest(root);
  const skills = manifest.skills ?? [];
  const active = skills.filter((s) => s.status !== 'planned');
  const toolNames = active.map((s) => toMcpToolName(s.id));
  return {
    skills: skills.length,
    activeSkills: active.length,
    tools: toolNames.length,
    plugins: countPlugins(root),
    toolNames,
  };
}
