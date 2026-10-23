#!/usr/bin/env node
/**
 * MCP 工具目录生成器（gen-mcp-tools）—— P4-T5。
 * 用法：node scripts/gen-mcp-tools.mjs [--check] [--json]
 *   --check  仅比对磁盘产物与清单派生结果，不写文件（CI/回归用）
 * 退出码：0 通过；1 工具名不合规 / 派生结果与磁盘不一致。
 *
 * 口径：manifest「active」技能 → MCP tools/list 工具描述符（planned = 未准入，不可见）；
 *       工具名 `.` → `__`、`-` → `_`（MCP 要求 ^[a-zA-Z0-9_-]+$）。
 * 边界：只读清单；写入仅限 assets/mcp-tools.json。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadManifest } from './lib/family-manifest.mjs';
import { toMcpToolName } from './lib/capability-supply.mjs';

const ROOT = process.cwd();
const OUT = 'assets/mcp-tools.json';
const TOOL_NAME_RE = /^[a-zA-Z0-9_-]+$/;
const asJson = process.argv.includes('--json');
const checkOnly = process.argv.includes('--check');

const manifest = loadManifest(ROOT);
const skills = manifest.skills ?? [];

/** 技能输入未声明结构化 io（P3-T1② 待补），统一最小对象 schema。 */
const INPUT_SCHEMA = Object.freeze({ type: 'object', properties: {}, additionalProperties: true });

const tools = [];
const hidden = [];
const errors = [];
const seen = new Set();

for (const skill of skills) {
  const name = toMcpToolName(skill.id ?? '');
  if (!TOOL_NAME_RE.test(name)) {
    errors.push(`工具名不合规：${skill.id} → ${name}`);
    continue;
  }
  if (seen.has(name)) {
    errors.push(`工具名冲突：${name}（${skill.id}）`);
    continue;
  }
  seen.add(name);
  if (skill.status === 'planned') {
    hidden.push({ logicalId: skill.id, name, reason: 'planned' });
    continue;
  }
  tools.push({
    name,
    logicalId: skill.id,
    title: skill.name,
    description: skill.description,
    inputSchema: INPUT_SCHEMA,
  });
}

const byLogicalId = (a, b) => (a.logicalId < b.logicalId ? -1 : a.logicalId > b.logicalId ? 1 : 0);
tools.sort(byLogicalId);
hidden.sort(byLogicalId);

const artifact = {
  generatedFrom: 'presets/family-manifest.yaml',
  protocolVersion: '2026-07-28',
  count: tools.length,
  hiddenCount: hidden.length,
  tools,
  hidden,
};
const content = `${JSON.stringify(artifact, null, 2)}\n`;

const target = path.join(ROOT, OUT);
const stale = [];
if (checkOnly) {
  if (!existsSync(target)) stale.push(`${OUT}（缺失）`);
  else if (readFileSync(target, 'utf8') !== content) stale.push(`${OUT}（内容过期）`);
} else if (errors.length === 0) {
  writeFileSync(target, content);
}

const ok = errors.length === 0 && stale.length === 0;

if (asJson) {
  console.log(
    JSON.stringify(
      {
        ok,
        mode: checkOnly ? 'check' : 'write',
        protocolVersion: artifact.protocolVersion,
        count: artifact.count,
        hiddenCount: artifact.hiddenCount,
        names: tools.map((t) => t.name),
        hiddenNames: hidden.map((h) => h.name),
        errors,
        stale,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`🧰 MCP 工具目录${checkOnly ? '一致性校验' : '生成'}（${OUT}）`);
  console.log(`   工具 ${tools.length} 个 · 不可见（planned）${hidden.length} 个`);
  for (const error of errors) console.log(`   ❌ ${error}`);
  for (const item of stale) console.log(`   ⚠ ${item}`);
  console.log(ok ? '✅ 工具名合规，产物与清单一致' : '❌ 校验未通过');
}

process.exit(ok ? 0 : 1);
