// @ts-nocheck
/**
 * 渐进披露检索测试（skill-progressive-disclosure）—— P3-T4。
 * 门禁映射：元数据索引（id + 一句描述 + tags，≤200 token/条）与正文分离——
 *   检索先查索引（`SkillRegistry.match`），命中后才经 `findByLogicalId` 加载全量定义（含 steps）；
 *   索引为生成产物 `skills/index.json`，与 45 个 SKILL.md 正文物理分离。
 * 设计：真实清单经脚本 lib 导出（运行时不解析 YAML）；匹配为纯索引操作，零网络。
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  SkillRegistry,
  matchSkillIndexEntries,
} from '../../family-agents/shared-core/memory-framework/procedural-memory/skill-registry.js';
import {
  SKILL_INDEX_TOKEN_BUDGET,
  estimateTokens,
  indexEntryTokens,
  indexEntryWithinBudget,
} from '../../architecture-kernel/05-持续学习引擎/skill-consolidation/skill-index.js';

const ROOT = process.cwd();

/** 从混合输出中提取 JSON（构建环境可能注入调试日志）。 */
function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`未找到 JSON 输出：${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1));
}

/** 经脚本 lib 导出真实清单技能段（运行时不解析 YAML，部署侧职责）。 */
function dumpManifestSkills() {
  const script = [
    `const { loadManifest } = await import(${JSON.stringify(
      path.join(ROOT, 'scripts/lib/family-manifest.mjs'),
    )});`,
    `const manifest = loadManifest(${JSON.stringify(ROOT)});`,
    'console.log(JSON.stringify({ skills: manifest.skills }));',
  ].join('\n');
  const run = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (run.status !== 0) throw new Error(`清单导出失败：${run.stderr?.slice(0, 300)}`);
  return extractJson(run.stdout).skills;
}

const MANIFEST_SKILLS = dumpManifestSkills();

/** 索引加载：只读 skills/index.json——渐进披露的验收前提（不触碰任何 SKILL.md 正文）。 */
const INDEX = JSON.parse(fs.readFileSync(path.join(ROOT, 'skills/index.json'), 'utf8'));

const INDEX_ONLY = new SkillRegistry();
INDEX_ONLY.loadIndex(INDEX.entries);

// ---------- 零依赖 harness（输出汇总行供门禁解析） ----------

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

describe('渐进披露检索（P3-T4）', () => {
  it('skills:check 零漂移（含 index.json）：45 技能产物 + 45 索引条目', () => {
    const run = spawnSync(process.execPath, ['scripts/gen-skill-artifacts.mjs', '--check', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const report = extractJson(run.stdout ?? '');
    globalThis.expect(run.status).toBe(0);
    globalThis.expect(report.ok).toBe(true);
    globalThis.expect(report.skills).toBe(45);
    globalThis.expect(report.indexCount).toBe(45);
    globalThis.expect(report.staleFiles.length).toBe(0);
    globalThis.expect(report.orphans.length).toBe(0);
  });

  it('索引结构：45 条、id 严格升序唯一、字段白名单无正文字段', () => {
    globalThis.expect(INDEX.count).toBe(45);
    globalThis.expect(INDEX.budgetTokens).toBe(200);
    const entries = INDEX.entries;
    globalThis.expect(entries.length).toBe(45);
    const allowed = new Set(['id', 'version', 'scope', 'owner', 'description', 'tags']);
    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i];
      for (const key of Object.keys(e)) {
        if (!allowed.has(key)) throw new Error(`索引条目含非白名单字段：${e.id}.${key}`);
      }
      if (!e.id || !e.description) throw new Error(`索引条目缺 id/description：${e.id}`);
      // 正文四件套一个都不能出现（渐进披露红线）
      if ('steps' in e || 'examples' in e || 'when' in e || 'kernel' in e) {
        throw new Error(`索引条目泄露正文字段：${e.id}`);
      }
      if (i > 0 && !(entries[i - 1].id < e.id)) throw new Error(`索引未按 id 严格升序：${entries[i - 1].id} → ${e.id}`);
    }
  });

  it('预算：45 条全部 ≤200 token（kernel 口径），并记录最大值', () => {
    let max = 0;
    let maxId = '';
    for (const e of INDEX.entries) {
      if (!indexEntryWithinBudget(e)) {
        throw new Error(`索引条目超预算：${e.id} = ${indexEntryTokens(e)} > ${SKILL_INDEX_TOKEN_BUDGET}`);
      }
      if (indexEntryTokens(e) > max) {
        max = indexEntryTokens(e);
        maxId = e.id;
      }
    }
    if (max > SKILL_INDEX_TOKEN_BUDGET) throw new Error(`最大条目超预算：${maxId}=${max}`);
    globalThis.expect(max <= SKILL_INDEX_TOKEN_BUDGET).toBe(true);
  });

  it('estimateTokens 口径确定性：CJK 逐字计 1，其余每 4 字符计 1', () => {
    globalThis.expect(estimateTokens('')).toBe(0);
    globalThis.expect(estimateTokens('意图检测')).toBe(4); // CJK 4 字 → 4
    globalThis.expect(estimateTokens('intent')).toBe(2); // 6 字符 → ceil(6/4)
    globalThis.expect(estimateTokens('intent classification')).toBe(6); // 21 字符 → ceil(21/4)
    globalThis.expect(estimateTokens('意图 intent')).toBe(4); // CJK 2 + 其余 7 → 2 + 2
    globalThis.expect(indexEntryTokens({ id: 'a.b', description: '检测', tags: ['x'] })).toBe(4); // CJK 2 + 其余 5 → 2 + 2
  });

  it('loadIndex 幂等且与正文注册表分离：索引加载后 list() 仍为 0', () => {
    const registry = new SkillRegistry();
    globalThis.expect(registry.loadIndex(INDEX.entries)).toBe(45);
    globalThis.expect(registry.loadIndex(INDEX.entries)).toBe(45); // 幂等覆盖
    globalThis.expect(registry.listIndex().length).toBe(45);
    globalThis.expect(registry.list().length).toBe(0); // 索引 ≠ 正文注册
  });

  it('match 先查索引：命中千行意图检测，结果不含 steps/when/examples', () => {
    const latin = INDEX_ONLY.match('qianhang intent');
    globalThis.expect(latin[0].id).toBe('qianhang.intent-detection');
    const cjk = INDEX_ONLY.match('意图检测');
    globalThis.expect(cjk.some((e) => e.id === 'qianhang.intent-detection')).toBe(true);
    for (const hit of [...latin, ...cjk]) {
      if ('steps' in hit || 'when' in hit || 'examples' in hit) throw new Error(`match 结果泄露正文：${hit.id}`);
    }
  });

  it('排序权重：tag(3) > id(2) > 描述(1)，同分 id 升序，limit 与空查询生效', () => {
    const tagHit = { id: 'shared.alpha', description: '通用能力', tags: ['deploy'] };
    const descHit = { id: 'shared.beta', description: 'deploy 部署', tags: [] };
    globalThis.expect(matchSkillIndexEntries([descHit, tagHit], 'deploy')[0].id).toBe('shared.alpha');
    const later = { id: 'x.c', description: '查额度' };
    const earlier = { id: 'a.d', description: '查额度' };
    globalThis.expect(matchSkillIndexEntries([later, earlier], '查额度')[0].id).toBe('a.d');
    globalThis.expect(matchSkillIndexEntries([tagHit], '').length).toBe(0);
    globalThis.expect(matchSkillIndexEntries([tagHit], 'zzz-no-hit').length).toBe(0);
    globalThis.expect(matchSkillIndexEntries([tagHit, descHit], 'deploy', 1).length).toBe(1);
  });

  it('两阶段闭环：索引命中 → 正文延迟加载（findByLogicalId 前后对比）', () => {
    const registry = new SkillRegistry();
    registry.loadIndex(INDEX.entries);
    const hit = registry.match('qianhang intent')[0];
    globalThis.expect(hit.id).toBe('qianhang.intent-detection');
    // 正文未加载：索引命中不可直接取全量定义
    globalThis.expect(registry.findByLogicalId(hit.id) === undefined).toBe(true);
    // 装载正文（真实清单 45 条，P2 激活 a2a-delegate）后，命中 id 可解析出全量定义（含 steps 容器）
    globalThis.expect(registry.loadFromManifest(MANIFEST_SKILLS).loaded).toBe(45);
    const full = registry.findByLogicalId(hit.id);
    globalThis.expect(full === undefined).toBe(false);
    globalThis.expect(Array.isArray(full.steps)).toBe(true);
    globalThis.expect(full.name).toBe('意图检测');
  });

  it('planned 技能可发现不可加载；空查询与 limit 生效', () => {
    const planned = INDEX_ONLY.listIndex().find((e) => e.id === 'shared.a2a-delegate');
    globalThis.expect(planned === undefined).toBe(false); // 索引呈现完整能力面
    globalThis.expect(INDEX_ONLY.findByLogicalId('shared.a2a-delegate') === undefined).toBe(true); // 运行时不可加载
    globalThis.expect(INDEX_ONLY.match('').length).toBe(0);
    globalThis.expect(INDEX_ONLY.match('qwikzorg').length).toBe(0); // 确定无命中的探针词
    globalThis.expect(INDEX_ONLY.match('intent', 1).length).toBe(1);
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
