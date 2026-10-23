// @ts-nocheck
/**
 * Agent Card 契约测试（agent-card.contract）—— P1-T2。
 * 门禁映射：`assets/agent-cards/*.json` 必须由 `presets/family-manifest.yaml` 派生、
 *           通过 `assets/schemas/agent-card.schema.json` 校验，且与清单零漂移。
 * 设计：先跑生成器的 `--check`（不写盘），再独立断言卡片自身不变量。
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

const ROOT = process.cwd();
const CARD_DIR = `${ROOT}/assets/agent-cards`;
const SLUGS = ['tianshu', 'qianhang', 'thinker', 'prophet', 'bole', 'guardian', 'grandmaster', 'grace'];

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`未找到 JSON 输出：${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1));
}

const run = spawnSync(process.execPath, ['scripts/gen-agent-cards.mjs', '--check', '--json'], {
  cwd: ROOT,
  encoding: 'utf8',
});
const report = extractJson(run.stdout ?? '');
const cards = readdirSync(CARD_DIR)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({ file: name.replace(/\.json$/, ''), card: JSON.parse(readFileSync(`${CARD_DIR}/${name}`, 'utf8')) }));

// ---------- 零依赖 harness ----------

const __localShim = typeof describe === 'undefined';
if (__localShim) {
  globalThis.__queue = [];
  globalThis.describe = (name, fn) => {
    globalThis.__suiteName = name;
    fn();
  };
  globalThis.it = (name, fn) => {
    globalThis.__queue.push({ name: `${globalThis.__suiteName ?? ''} > ${name}`, fn });
  };
  globalThis.expect = (actual) => ({
    toBe: (exp) => {
      if (actual !== exp) throw new Error(`期望 ${JSON.stringify(exp)}，实际 ${JSON.stringify(actual)}`);
    },
    toBeTruthy: () => {
      if (!actual) throw new Error(`期望真值，实际 ${JSON.stringify(actual)}`);
    },
  });
}

describe('Agent Card（P1-T2）', () => {
  it('一致性校验以 0 退出且无 schema 错误', () => {
    globalThis.expect(run.status).toBe(0);
    globalThis.expect(report.schemaErrors.length).toBe(0);
  });

  it('产物与清单零漂移（无缺失 / 无过期）', () => {
    globalThis.expect(report.staleFiles.length).toBe(0);
    globalThis.expect(report.cards).toBe(8);
  });

  it('实际落盘 8 张卡且覆盖全部 slug', () => {
    globalThis.expect(cards.length).toBe(8);
    globalThis.expect(cards.map((c) => c.file).sort().join(',')).toBe([...SLUGS].sort().join(','));
  });

  it('每张卡的 $schema 指向本地契约', () => {
    for (const { card } of cards) {
      globalThis.expect(card.$schema).toBe('../schemas/agent-card.schema.json');
    }
  });

  it('家人编号唯一且均为 8 位', () => {
    const ids = cards.map((c) => c.card.agentCard.yyc3.id);
    globalThis.expect(new Set(ids).size).toBe(8);
    for (const id of ids) globalThis.expect(/^[0-9]{6}-[0-9]{2}$/.test(id)).toBe(true);
  });

  it('卡片 URL 与文件名 slug 一一对应', () => {
    for (const { file, card } of cards) {
      globalThis.expect(card.agentCard.url.endsWith(`/${file}`)).toBe(true);
    }
  });

  it('技能 ID 前缀合法（shared 或本家人专用）', () => {
    for (const { file, card } of cards) {
      for (const skill of card.agentCard.skills) {
        const prefix = skill.id.split('.')[0];
        const ok = prefix === 'shared' || prefix === file;
        if (!ok) throw new Error(`${file}: 非法技能前缀 ${skill.id}`);
      }
    }
  });

  it('每张卡至少 9 项技能', () => {
    for (const { card } of cards) {
      globalThis.expect(card.agentCard.skills.length >= 9).toBe(true);
    }
  });
});

(async () => {
  const queue = globalThis.__queue ?? [];
  let passed = 0;
  const failures = [];
  for (const t of queue) {
    try {
      await t.fn();
      passed += 1;
      console.log(`PASS ${t.name}`);
    } catch (e) {
      failures.push(t.name);
      console.log(`FAIL ${t.name}\n      ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`结果：${passed} 通过 / ${failures.length} 失败 / ${queue.length - passed - failures.length} 跳过 / 共 ${queue.length} 例`);
  if (failures.length > 0) process.exit(1);
})();
