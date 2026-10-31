#!/usr/bin/env node
/**
 * 业务域卡校验（check-profiles）—— E4a（演进集 v1.2.0 解冻第一波）。
 * 用法：node scripts/check-profiles.mjs [--json]
 * 校验：presets/profiles/domains/*.yaml 逐份结构校验 + 全局对账——
 *   ① 必需键齐全（id/domain/owner/preferences.tier/preferences.output_style/prompt_anchors）；
 *   ② id 与文件名一致且全局唯一；
 *   ③ owner ∈ 八家人 slug（人格红线：8 位定数）；
 *   ④ tier ∈ {reasoning, flagship, speed}（档位占位，模型名归部署侧 env）；
 *   ⑤ 恰好 8 份（八家人各一张，E1b 业务卷题源完备性）。
 * 边界：只读；不写文件、不联网。退出码 0 通过 / 1 失败。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './lib/yaml-lite.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOMAINS_DIR = path.join(ROOT, 'presets', 'profiles', 'domains');

const FAMILY_SLUGS = new Set([
  'tianshu', 'qianhang', 'thinker', 'prophet', 'bole', 'guardian', 'grandmaster', 'grace',
]);
const TIERS = new Set(['reasoning', 'flagship', 'speed']);
const REQUIRED = ['id', 'domain', 'owner', 'preferences', 'prompt_anchors'];

const jsonMode = process.argv.includes('--json');
const problems = [];
const cards = [];

if (!fs.existsSync(DOMAINS_DIR)) {
  console.error('❌ 域卡目录缺失：presets/profiles/domains/');
  process.exit(1);
}
for (const entry of fs.readdirSync(DOMAINS_DIR, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue;
  const file = path.join(DOMAINS_DIR, entry.name);
  const id = entry.name.replace(/\.yaml$/, '');
  let card;
  try {
    card = parseYaml(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    problems.push(`${entry.name}: YAML 解析失败——${e.message}`);
    continue;
  }
  for (const key of REQUIRED) {
    if (card[key] === undefined) problems.push(`${entry.name}: 缺必需键 ${key}`);
  }
  if (card.id !== undefined && card.id !== id) problems.push(`${entry.name}: id（${card.id}）与文件名不一致`);
  if (card.owner !== undefined && !FAMILY_SLUGS.has(card.owner)) {
    problems.push(`${entry.name}: owner（${card.owner}）不在八家人 slug 集合（人格红线）`);
  }
  const tier = card.preferences?.tier;
  if (tier !== undefined && !TIERS.has(tier)) problems.push(`${entry.name}: tier（${tier}）∉ {reasoning, flagship, speed}`);
  if (Array.isArray(card.prompt_anchors) && card.prompt_anchors.length === 0) {
    problems.push(`${entry.name}: prompt_anchors 为空（E1b 题源不可为空）`);
  }
  if (!Array.isArray(card.prompt_anchors)) problems.push(`${entry.name}: prompt_anchors 必须为列表`);
  cards.push({ file: entry.name, id, owner: card.owner, domain: card.domain, tier });
}

const ids = cards.map((c) => c.id);
if (new Set(ids).size !== ids.length) problems.push(`画像 id 重复：${ids.join(', ')}`);
if (cards.length !== 8) problems.push(`域卡数量 ${cards.length} ≠ 8（八家人各一张）`);
const owners = new Set(cards.map((c) => c.owner));
if (owners.size !== cards.length) problems.push('owner 重复（八家人各承载一张，不可一人两卡）');

if (jsonMode) {
  console.log(JSON.stringify({ ok: problems.length === 0, count: cards.length, problems, cards }, null, 2));
} else {
  for (const c of cards) console.log(`   · ${c.id}（owner=${c.owner} · ${c.domain} · tier=${c.tier}）`);
}
if (problems.length > 0) {
  console.error(`❌ 业务域卡校验失败（${problems.length} 处）：`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`✅ 业务域卡校验通过：${cards.length} 份（八家人全覆盖 · tier 占位合规 · E1b 题源就绪）`);
