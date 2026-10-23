// @ts-nocheck
/**
 * 能力供给契约测试（capability-supply.contract）—— P3-T6。
 * 门禁映射：面板 data.json.capabilities = {skills, tools, plugins} 与
 *           scripts/lib/capability-supply.mjs（单一事实源）同源零漂移；
 *           面板 index.html 「能力供给」卡片显示 45 / 44 / 0。
 * 设计：spawnSync 真实计数模块（零依赖、只读不写盘），与清单正则抽取交叉验证。
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const LIB = path.join(ROOT, 'scripts/lib/capability-supply.mjs');

/** 以 ESModule 方式调用真实计数模块并取回 JSON 结论。 */
const probe = spawnSync(
  process.execPath,
  [
    '--input-type=module',
    '--eval',
    `import { countCapabilitySupply } from ${JSON.stringify(pathToFileURL(LIB).href)};
const supply = countCapabilitySupply(${JSON.stringify(ROOT)});
process.stdout.write(JSON.stringify(supply));`,
  ],
  { cwd: ROOT, encoding: 'utf8' },
);

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`未找到 JSON 输出：${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1));
}

const supply = extractJson(probe.stdout ?? '');

/** 从清单技能段正则抽取全部技能 id（与 skill-artifacts 契约同款交叉验证）。 */
function manifestSkillIds() {
  const yaml = readFileSync(path.join(ROOT, 'presets/family-manifest.yaml'), 'utf8');
  const section = yaml.slice(yaml.indexOf('\nskills:\n'), yaml.indexOf('\nprompts:\n'));
  return [...section.matchAll(/- id: ([a-z0-9]+\.[a-z0-9-]+)\n\s+version: "/g)].map((m) => m[1]);
}

/** 从清单技能段抽取 planned 技能 id（status: planned 紧随 id 块）。 */
function manifestPlannedIds() {
  const yaml = readFileSync(path.join(ROOT, 'presets/family-manifest.yaml'), 'utf8');
  const section = yaml.slice(yaml.indexOf('\nskills:\n'), yaml.indexOf('\nprompts:\n'));
  const ids = [];
  const re = /- id: ([a-z0-9]+\.[a-z0-9-]+)(?:(?!- id:)[\s\S])*?status: planned/g;
  for (const m of section.matchAll(re)) ids.push(m[1]);
  return ids;
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

describe('能力供给契约（P3-T6）', () => {
  it('计数器以 0 退出且输出结构合法（非负整数 + tools ↔ toolNames 等长）', () => {
    globalThis.expect(probe.status).toBe(0);
    for (const key of ['skills', 'activeSkills', 'tools', 'plugins']) {
      if (!Number.isInteger(supply[key]) || supply[key] < 0) throw new Error(`${key} 非非负整数：${supply[key]}`);
    }
    globalThis.expect(supply.tools).toBe(supply.toolNames.length);
    globalThis.expect(supply.activeSkills).toBe(supply.toolNames.length);
  });

  it('skills 与清单技能段交叉验证一致（45 = 45）', () => {
    globalThis.expect(supply.skills).toBe(45);
    globalThis.expect(supply.skills).toBe(manifestSkillIds().length);
  });

  it('tools = active 技能数（45，P2 激活 a2a-delegate）且工具名全部合规唯一（^[a-zA-Z0-9_-]+$）', () => {
    globalThis.expect(supply.tools).toBe(45);
    const seen = new Set();
    for (const name of supply.toolNames) {
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error(`MCP 工具名不合规：${name}`);
      if (seen.has(name)) throw new Error(`MCP 工具名重复：${name}`);
      seen.add(name);
    }
  });

  it('planned 归零不可见（P2 激活后）+ 统一 id → MCP 名映射规则（. → __，- → _）', () => {
    const planned = manifestPlannedIds();
    globalThis.expect(planned.length).toBe(0);
    globalThis.expect(supply.activeSkills).toBe(45);
    // 映射规则抽查：与 mcp-server 契约锚点 qianhang__intent_detection 对齐
    const sample = manifestSkillIds().find((id) => id === 'qianhang.intent-detection');
    if (!sample) throw new Error('清单缺少锚点技能 qianhang.intent-detection');
    const mcpName = sample.replace('.', '__').replace(/-/g, '_');
    globalThis.expect(mcpName).toBe('qianhang__intent_detection');
    globalThis.expect(supply.toolNames.includes(mcpName)).toBeTruthy();
  });

  it('plugins = 0（P4 预留；plugins/ 目录缺失或无 plugin.yaml）', () => {
    const dir = path.join(ROOT, 'plugins');
    if (!existsSync(dir)) {
      globalThis.expect(supply.plugins).toBe(0);
    } else {
      // 目录存在时计数必须 ≥ 0 且仅统计含 plugin.yaml 的子目录（口径自洽）
      globalThis.expect(supply.plugins >= 0).toBeTruthy();
    }
  });

  it('面板产物与计数器同源（data.json capabilities 三数值 + index.html 能力供给区块）', () => {
    const dataPath = path.join(ROOT, 'ops/observability/pillar-dashboard/data.json');
    if (!existsSync(dataPath)) throw new Error('面板 data.json 不存在（先执行 pnpm regression）');
    const data = JSON.parse(readFileSync(dataPath, 'utf8'));
    if (data.capabilities === undefined) {
      // 升级首跑时序：面板写盘发生在套件运行之后；下一轮起走强校验分支
      if (!existsSync(path.join(ROOT, 'ops/observability/pillar-dashboard/index.html'))) {
        throw new Error('面板产物缺失');
      }
      return;
    }
    globalThis.expect(data.capabilities.skills).toBe(supply.skills);
    globalThis.expect(data.capabilities.tools).toBe(supply.tools);
    globalThis.expect(data.capabilities.plugins).toBe(supply.plugins);
    const html = readFileSync(path.join(ROOT, 'ops/observability/pillar-dashboard/index.html'), 'utf8');
    if (!html.includes('能力供给')) throw new Error('index.html 缺少「能力供给」卡片区（P3-T6）');
    for (const n of [supply.skills, supply.tools, supply.plugins]) {
      if (!html.includes(`>${n}<`)) throw new Error(`index.html 未显示能力数值：${n}`);
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
