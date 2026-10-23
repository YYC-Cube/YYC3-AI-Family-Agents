#!/usr/bin/env node
/**
 * 家族契约清单校验（check-manifest）—— P1-T1。
 * 用法：node scripts/check-manifest.mjs [--json]
 * 退出码：0 通过（可含警告）；1 存在结构错误或 agent.yaml 漂移。
 * 边界：只读；不写任何文件、不联网。
 */

import path from 'node:path';
import { loadManifest, validateManifest, MANIFEST_FILE } from './lib/family-manifest.mjs';

const ROOT = process.cwd();
const asJson = process.argv.includes('--json');

const manifest = loadManifest(ROOT);
const { errors, warnings, stats } = validateManifest(ROOT, manifest);

if (asJson) {
  console.log(JSON.stringify({ ok: errors.length === 0, errors, warnings, stats }, null, 2));
} else {
  console.log(`📋 家族契约清单校验（${MANIFEST_FILE}）`);
  console.log(
    `   家人 ${stats.agents} · 技能 ${stats.skills}（共用 ${stats.shared} / 专用 ${stats.dedicated}）` +
      ` · 提示词 ${stats.prompts ?? 0} · 委托边 ${stats.delegationEdges} · 待实装 ${stats.planned}`,
  );
  for (const warning of warnings) console.log(`   ⚠ ${warning}`);
  if (errors.length === 0) {
    console.log('✅ 结构校验通过，agent.yaml 漂移 0');
  } else {
    console.log(`❌ 发现 ${errors.length} 个问题：`);
    for (const error of errors) console.log(`   - ${error}`);
  }
}

process.exit(errors.length === 0 ? 0 : 1);
