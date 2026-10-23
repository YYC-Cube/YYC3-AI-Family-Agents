#!/usr/bin/env node
/**
 * Agent Card 生成器（gen-agent-cards）—— P1-T2。
 * 用法：node scripts/gen-agent-cards.mjs [--check] [--json]
 *   --check  仅比对磁盘产物与清单派生结果，不写文件（CI/回归用）
 * 退出码：0 通过；1 schema 不合法 / 派生结果与磁盘不一致。
 * 边界：只读清单与 schema；写入仅限 assets/agent-cards/ 下的 8 个 json。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildCards, loadManifest, CARD_DIR, CARD_SCHEMA } from './lib/family-manifest.mjs';
import { validate } from './lib/json-schema-lite.mjs';

const ROOT = process.cwd();
const asJson = process.argv.includes('--json');
const checkOnly = process.argv.includes('--check');

const manifest = loadManifest(ROOT);
const schema = JSON.parse(readFileSync(path.join(ROOT, CARD_SCHEMA), 'utf8'));
const cards = buildCards(manifest);

const schemaErrors = [];
const staleFiles = [];
const outDir = path.join(ROOT, CARD_DIR);

for (const { file, card } of cards) {
  for (const error of validate(schema, card)) schemaErrors.push(`${file}: ${error}`);
  const target = path.join(outDir, file);
  if (checkOnly) {
    if (!existsSync(target)) {
      staleFiles.push(`${file}（缺失）`);
    } else if (readFileSync(target, 'utf8') !== `${JSON.stringify(card, null, 2)}\n`) {
      staleFiles.push(`${file}（内容过期）`);
    }
  } else {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(target, `${JSON.stringify(card, null, 2)}\n`);
  }
}

const ok = schemaErrors.length === 0 && staleFiles.length === 0;

if (asJson) {
  console.log(
    JSON.stringify(
      {
        ok,
        mode: checkOnly ? 'check' : 'write',
        cards: cards.length,
        skillsPerCard: Object.fromEntries(cards.map((c) => [c.file, c.card.agentCard.skills.length])),
        schemaErrors,
        staleFiles,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`🎴 Agent Card ${checkOnly ? '一致性校验' : '生成'}（${CARD_DIR}）`);
  console.log(`   卡片 ${cards.length} 张 · 每张技能 ${cards.map((c) => c.card.agentCard.skills.length).join('/')}`);
  for (const error of schemaErrors) console.log(`   ❌ ${error}`);
  for (const stale of staleFiles) console.log(`   ⚠ ${stale}`);
  console.log(ok ? '✅ schema 合法，产物与清单一致' : '❌ 校验未通过');
}

process.exit(ok ? 0 : 1);
