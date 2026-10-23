// @ts-nocheck
/**
 * 统一技能 id 与加载器测试（skill-id-unification）—— P3-T3。
 * 门禁映射：三套技能表示 id 可互查——
 *   ① manifest 契约 id →（loadFromManifest）→ ② 运行时 SkillRegistry →（logicalId 桥）→ ③ 学习引擎 SkillStore；
 *   历史 FNV 主键按 `learned.{内部 id}` 归并读取（演进指导 ADR-D2）。
 * 设计：真实清单经脚本 lib 导出后注入加载器（运行时不做 YAML 解析）；
 *       FileSkillStore 用临时目录，零网络。
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SkillRegistry } from '../../family-agents/shared-core/memory-framework/procedural-memory/skill-registry.js';
import {
  canonicalOfLearned,
  isFnvSkillId,
  isLearnedId,
  learnedSkillId,
  legacyLearnedId,
  manifestSkillId,
} from '../../architecture-kernel/05-持续学习引擎/skill-consolidation/skill-id.js';
import { FileSkillStore } from '../../architecture-kernel/05-持续学习引擎/skill-consolidation/skill-store-file.js';

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
const registry = new SkillRegistry();
const load1 = registry.loadFromManifest(MANIFEST_SKILLS);

function kernelSkill(id, extra = {}) {
  return {
    id,
    name: `测试技能 ${id}`,
    version: '1.0.0',
    description: 'P3-T3 统一 id 测试',
    when: ['测试条件'],
    steps: ['step-1'],
    status: 'active',
    createdAt: 0,
    useCount: 0,
    ...extra,
  };
}

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

describe('统一技能 id 与加载器（P3-T3）', () => {
  it('真实清单装载：45 条中 44 加载，planned 恰好跳过 shared.a2a-delegate', () => {
    globalThis.expect(MANIFEST_SKILLS.length).toBe(45);
    globalThis.expect(load1.loaded).toBe(44);
    if (JSON.stringify(load1.skippedPlanned) !== JSON.stringify(['shared.a2a-delegate'])) {
      throw new Error(`planned 跳过不符：${JSON.stringify(load1.skippedPlanned)}`);
    }
    globalThis.expect(registry.list().length).toBe(44);
  });

  it('互查① manifest → registry：findByLogicalId 与 latest 同源', () => {
    const hit = registry.findByLogicalId('qianhang.intent-detection');
    globalThis.expect(hit === undefined).toBe(false);
    globalThis.expect(hit.name).toBe('意图检测');
    globalThis.expect(hit.version).toBe('1.0.0');
    globalThis.expect(hit.steps.length).toBe(0); // 契约装载为描述态，步骤待 P3-T3 后续补全
    globalThis.expect(registry.latest('qianhang.intent-detection')).toBe(hit);
  });

  it('互查② 归属抽查：shared 与专用技能前缀 = 家人 slug', () => {
    globalThis.expect(registry.findByLogicalId('shared.self-judge') === undefined).toBe(false);
    for (const prefix of ['qianhang', 'bole', 'grandmaster']) {
      const skills = registry.list().filter((s) => s.id.startsWith(`${prefix}.`));
      if (skills.length !== 4) throw new Error(`${prefix} 专用技能应为 4，实际 ${skills.length}`);
    }
  });

  it('skill-id 帮助器：派生 / 往返 / 非法即抛', () => {
    globalThis.expect(manifestSkillId('qianhang', 'intent-detection')).toBe('qianhang.intent-detection');
    globalThis.expect(learnedSkillId('qianhang', 'intent-detection')).toBe('learned.qianhang.intent-detection');
    globalThis.expect(isLearnedId('learned.shared.self-judge')).toBe(true);
    globalThis.expect(isLearnedId('qianhang.intent-detection')).toBe(false);
    globalThis.expect(canonicalOfLearned('learned.qianhang.intent-detection')).toBe('qianhang.intent-detection');
    globalThis.expect(canonicalOfLearned('qianhang.intent-detection')).toBe(null);
    globalThis.expect(isFnvSkillId('skill-1a2b3c4d')).toBe(true);
    globalThis.expect(isFnvSkillId('qianhang.intent-detection')).toBe(false);
    globalThis.expect(legacyLearnedId('skill-1a2b3c4d')).toBe('learned.skill-1a2b3c4d');
    let threw = false;
    try {
      manifestSkillId('QianHang', 'Bad Slug!');
    } catch {
      threw = true;
    }
    globalThis.expect(threw).toBe(true);
  });

  it('SkillStore 显式 logicalId：命中且内部主键不变', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-skill-id-'));
    const store = new FileSkillStore(dir);
    const learned = learnedSkillId('qianhang', 'intent-detection');
    store.replaceHistory('skill-aaaa1111', [kernelSkill('skill-aaaa1111', { logicalId: learned })]);
    const hit = store.findByLogicalId(learned);
    globalThis.expect(hit === undefined).toBe(false);
    globalThis.expect(hit.id).toBe('skill-aaaa1111'); // FNV 主键保留为内部键（ADR-D2）
    globalThis.expect(store.historyOf('skill-aaaa1111').length).toBe(1);
    globalThis.expect(store.size()).toBe(1);
  });

  it('历史数据归并：无 logicalId 的 FNV 主键按 learned.{内部 id} 可查', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-skill-id-'));
    const store = new FileSkillStore(dir);
    store.replaceHistory('skill-bbbb2222', [kernelSkill('skill-bbbb2222')]); // 无 logicalId（存量形态）
    globalThis.expect(store.findByLogicalId('learned.skill-bbbb2222') === undefined).toBe(false);
    globalThis.expect(store.findByLogicalId('skill-bbbb2222') === undefined).toBe(true);
  });

  it('三套闭环：学习沉淀 → 规范 id → manifest 契约 → registry 全连通', () => {
    const learned = 'learned.qianhang.context-session';
    const canonical = canonicalOfLearned(learned);
    globalThis.expect(canonical).toBe('qianhang.context-session');
    const inRegistry = registry.findByLogicalId(canonical);
    globalThis.expect(inRegistry === undefined).toBe(false);
    globalThis.expect(inRegistry.id).toBe('qianhang.context-session');
  });

  it('幂等重载：同版本覆盖不产生重复', () => {
    const load2 = registry.loadFromManifest(MANIFEST_SKILLS);
    globalThis.expect(load2.loaded).toBe(44);
    globalThis.expect(registry.list().length).toBe(44);
    const versions = registry.list().filter((s) => s.id === 'shared.self-judge');
    globalThis.expect(versions.length).toBe(1);
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
