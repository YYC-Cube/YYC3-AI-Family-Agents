#!/usr/bin/env node
/**
 * 技能产物生成器（gen-skill-artifacts）—— P3-T2。
 * 用法：node scripts/gen-skill-artifacts.mjs [--check] [--json]
 *   --check  仅比对磁盘产物与清单派生结果，不写文件（CI/回归用）
 * 退出码：0 通过；1 派生结果与磁盘不一致 / 存在孤儿产物。
 * 边界：只读清单；写入仅限 skills/ 下的 SKILL.md。
 * 范式：与 gen-agent-cards 同构——manifest 唯一事实源 → 生成产物 → --check 零漂移。
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadManifest, MANIFEST_FILE } from './lib/family-manifest.mjs';

const ROOT = process.cwd();
const asJson = process.argv.includes('--json');
const checkOnly = process.argv.includes('--check');

const SKILL_DIR = 'skills';
/** 派生一条技能的 SKILL.md 内容（确定性输出，LF 换行）。 */
export function buildSkillMarkdown(skill, slugById) {
  const [prefix, slug] = skill.id.split('.');
  const owner = skill.scope === 'shared' ? 'shared' : (slugById.get(skill.owner) ?? skill.owner);
  if (skill.scope === 'dedicated' && !slugById.has(skill.owner)) {
    throw new Error(`技能 ${skill.id} 的 owner 无法解析为家人 slug：${skill.owner}`);
  }
  const rel = `${SKILL_DIR}/${prefix}/${slug}/SKILL.md`;
  const front = [
    '---',
    `name: ${skill.name}`,
    `description: ${skill.description}`,
    `version: ${skill.version}`,
    `id: ${skill.id}`,
    `scope: ${skill.scope}`,
    `owner: ${owner}`,
    '---',
    '',
    '',
  ];
  const body = [
    `# ${skill.name}（\`${skill.id}\`）`,
    '',
    '> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；',
    '> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。',
    '',
    '| 属性 | 值 |',
    '| ---- | -- |',
    `| 技能 id | \`${skill.id}\` |`,
    `| 归属（owner） | ${owner} |`,
    `| scope | ${skill.scope} |`,
    `| 版本 | ${skill.version} |`,
    `| 支柱 | ${(skill.pillars ?? []).join(' · ') || '—'} |`,
    `| 标签 | ${(skill.tags ?? []).map((t) => `\`${t}\``).join(' ')} |`,
    `| 实现锚点（kernel） | ${skill.kernel ? `\`${skill.kernel}\`` : '（纯描述，暂无锚点）'} |`,
    skill.status ? `| 状态 | ${skill.status} |` : null,
    '',
    '## 示例',
    '',
    ...(skill.examples ?? []).map((e) => `- ${e}`),
    '',
  ].filter((l) => l !== null);
  return { rel, content: `${front.join('\n')}${body.join('\n')}` };
}

/** 派生全部技能产物（供脚本与契约测试共用）。 */
export function buildSkillArtifacts(manifest, slugById = new Map((manifest.agents ?? []).map((a) => [a.id, a.slug]))) {
  return (manifest.skills ?? []).map((skill) => buildSkillMarkdown(skill, slugById));
}

/**
 * 派生技能元数据索引（P3-T4 渐进披露）——正文与索引分离：
 * 条目仅含 id/version/scope/owner/description/tags（无 steps/examples 等正文），
 * 以 `skills/index.json` 落盘，检索先查索引、命中后才加载正文。
 */
export function buildSkillIndex(manifest, slugById) {
  const entries = (manifest.skills ?? []).map((skill) => ({
    id: skill.id,
    version: skill.version,
    scope: skill.scope,
    owner: skill.scope === 'shared' ? 'shared' : (slugById.get(skill.owner) ?? skill.owner),
    description: skill.description,
    tags: [...(skill.tags ?? [])],
  }));
  entries.sort((a, b) => a.id.localeCompare(b.id));
  const doc = { generatedFrom: MANIFEST_FILE, budgetTokens: 200, count: entries.length, entries };
  return {
    rel: `${SKILL_DIR}/index.json`,
    content: `${JSON.stringify(doc, null, 2)}\n`,
    count: entries.length,
  };
}

/** 扫描 skills/ 下的孤儿 SKILL.md（不在派生集合中即孤儿）。 */
export function scanOrphans(root, derivedRels) {
  const base = path.join(root, SKILL_DIR);
  const found = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === 'SKILL.md') found.push(path.relative(root, full).split(path.sep).join('/'));
    }
  };
  walk(base);
  const known = new Set(derivedRels);
  return found.filter((rel) => !known.has(rel));
}

const manifest = loadManifest(ROOT);
const slugById = new Map((manifest.agents ?? []).map((a) => [a.id, a.slug]));
const artifacts = buildSkillArtifacts(manifest, slugById);
const skillIndex = buildSkillIndex(manifest, slugById);
const staleFiles = [];
const orphans = [];

for (const { rel, content } of artifacts) {
  const target = path.join(ROOT, rel);
  if (checkOnly) {
    if (!existsSync(target)) staleFiles.push(`${rel}（缺失）`);
    else if (readFileSync(target, 'utf8') !== content) staleFiles.push(`${rel}（内容过期）`);
  } else {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}
{
  const target = path.join(ROOT, skillIndex.rel);
  if (checkOnly) {
    if (!existsSync(target)) staleFiles.push(`${skillIndex.rel}（缺失）`);
    else if (readFileSync(target, 'utf8') !== skillIndex.content) staleFiles.push(`${skillIndex.rel}（内容过期）`);
  } else {
    writeFileSync(target, skillIndex.content);
  }
}
orphans.push(...scanOrphans(ROOT, artifacts.map((a) => a.rel)));

const ok = staleFiles.length === 0 && orphans.length === 0;

if (asJson) {
  console.log(
    JSON.stringify(
      { ok, mode: checkOnly ? 'check' : 'write', skills: artifacts.length, indexCount: skillIndex.count, staleFiles, orphans },
      null,
      2,
    ),
  );
} else {
  console.log(`🧩 技能产物${checkOnly ? '一致性校验' : '生成'}（${SKILL_DIR}/ · 源 ${MANIFEST_FILE}）`);
  console.log(`   技能 ${artifacts.length} 条（共用 ${artifacts.filter((a) => a.rel.includes('/shared/')).length}）`);
  console.log(`   元数据索引 ${skillIndex.count} 条（${SKILL_DIR}/index.json · 正文分离 · ≤200 token/条）`);
  for (const stale of staleFiles) console.log(`   ⚠ ${stale}`);
  for (const orphan of orphans) console.log(`   ⚠ 孤儿产物：${orphan}`);
  console.log(ok ? '✅ 产物与清单一致，无孤儿' : '❌ 校验未通过');
}

process.exit(ok ? 0 : 1);
