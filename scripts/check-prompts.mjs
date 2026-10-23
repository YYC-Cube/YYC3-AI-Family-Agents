#!/usr/bin/env node
/**
 * 提示词契约校验（check-prompts）—— P1-T5。
 * 用法：node scripts/check-prompts.mjs [--json]
 * 退出码：0 通过（可含警告）；1 存在错误。
 * 职责：在 manifest:check 之外补充两项全局断言——
 *       ① 全量扫描各家人 prompts 目录下的 *.prompt.ts，磁盘孤儿文件视为错误；
 *       ② 汇总每条契约的明细（版本双向、vars、outputSchema）供契约套件消费。
 * 边界：只读；不联网；零依赖。
 */

import path from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { loadManifest, validateManifest, extractPromptMeta, MANIFEST_FILE } from './lib/family-manifest.mjs';

const ROOT = process.cwd();
const asJson = process.argv.includes('--json');

/** 全量扫描磁盘上的提示词文件（相对路径，排序）。 */
function scanPromptFiles() {
  const files = [];
  const base = path.join(ROOT, 'family-agents');
  if (!existsSync(base)) return files;
  for (const layer of readdirSync(base, { withFileTypes: true })) {
    if (!layer.isDirectory() || !layer.name.endsWith('-layer')) continue;
    const layerDir = path.join(base, layer.name);
    for (const member of readdirSync(layerDir, { withFileTypes: true })) {
      if (!member.isDirectory() || !member.name.startsWith('member-')) continue;
      const promptsDir = path.join(layerDir, member.name, 'prompts');
      if (!existsSync(promptsDir)) continue;
      for (const file of readdirSync(promptsDir, { withFileTypes: true })) {
        if (file.isFile() && file.name.endsWith('.prompt.ts')) {
          files.push(path.relative(ROOT, path.join(promptsDir, file.name)));
        }
      }
    }
  }
  return files.sort();
}

const manifest = loadManifest(ROOT);
const { errors, warnings, stats } = validateManifest(ROOT, manifest);

const onDisk = scanPromptFiles();
const registered = new Set((manifest.prompts ?? []).map((p) => p.file));
const orphans = onDisk.filter((f) => !registered.has(f));
for (const orphan of orphans) errors.push(`磁盘提示词文件未回写清单（孤儿）：${orphan}`);

// 契约明细（含文件侧版本，供 A/B 与契约测试消费）
const details = (manifest.prompts ?? []).map((entry) => {
  let fileVersion = null;
  let vars = [];
  let outputSchema = null;
  if (entry.file && existsSync(path.join(ROOT, entry.file))) {
    const meta = extractPromptMeta(readFileSync(path.join(ROOT, entry.file), 'utf8'));
    if (!meta.__parseError) {
      fileVersion = meta.version ?? null;
      vars = (meta.vars ?? []).map((v) => v.name);
      outputSchema = meta.outputSchema ?? null;
    }
  }
  return {
    id: entry.id,
    owner: entry.owner ?? null,
    version: entry.version ?? null,
    fileVersion,
    file: entry.file ?? null,
    vars,
    outputSchema,
  };
});

const drift = details.filter((d) => d.version !== d.fileVersion).length;

if (asJson) {
  console.log(
    JSON.stringify(
      { ok: errors.length === 0, errors, warnings, stats: { ...stats, files: onDisk.length, orphans: orphans.length, drift }, prompts: details },
      null,
      2,
    ),
  );
} else {
  console.log(`📝 提示词契约校验（${MANIFEST_FILE} · P1-T5）`);
  console.log(`   契约 ${stats.prompts} · 磁盘文件 ${onDisk.length} · 孤儿 ${orphans.length} · 版本漂移 ${drift}`);
  for (const warning of warnings) console.log(`   ⚠ ${warning}`);
  if (errors.length === 0) {
    console.log('✅ 提示词契约通过：版本回写零漂移，CO-STAR 七要素齐备');
  } else {
    console.log(`❌ 发现 ${errors.length} 个问题：`);
    for (const error of errors) console.log(`   - ${error}`);
  }
}

process.exit(errors.length === 0 ? 0 : 1);
