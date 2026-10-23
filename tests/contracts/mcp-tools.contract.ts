// @ts-nocheck
/**
 * MCP 工具目录契约测试（mcp-tools.contract）—— P4-T5。
 * 门禁映射：manifest 技能 → tools/list 目录资产的派生零漂移；
 *   工具名符合 MCP 命名（^[a-zA-Z0-9_-]+$）；planned 未准入不可见；
 *   与技能索引（45）及能力供给面板（tools 44）同源交叉。
 * 设计：spawnSync 真实生成器（--check --json），与磁盘资产 / index.json / data.json 交叉验证。
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCRIPT = 'scripts/gen-mcp-tools.mjs';
const ARTIFACT = 'assets/mcp-tools.json';
const TOOL_NAME_RE = /^[a-zA-Z0-9_-]+$/;

function run(args) {
  const res = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`未找到 JSON 输出：${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1));
}

const generated = run(['--check', '--json']);
const report = extractJson(generated.stdout);
const artifact = JSON.parse(readFileSync(path.join(ROOT, ARTIFACT), 'utf8'));
const index = JSON.parse(readFileSync(path.join(ROOT, 'skills/index.json'), 'utf8'));

/** id → MCP 工具名（与 scripts/lib/capability-supply.mjs 同规则，独立实现用于交叉断言）。 */
const toToolName = (id) => id.replace('.', '__').replace(/-/g, '_');

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
    toBeFalsy: () => {
      if (actual) throw new Error(`期望假值，实际 ${JSON.stringify(actual)}`);
    },
  });
}

describe('MCP 工具目录契约（P4-T5）', () => {
  it('--check --json 以 0 退出：产物与清单派生一致（45 可见 + 0 不可见，P2 激活）', () => {
    globalThis.expect(generated.status).toBe(0);
    globalThis.expect(report.ok).toBeTruthy();
    globalThis.expect(report.mode).toBe('check');
    globalThis.expect(report.count).toBe(45);
    globalThis.expect(report.hiddenCount).toBe(0);
    globalThis.expect(report.protocolVersion).toBe('2026-07-28');
    globalThis.expect(artifact.count).toBe(45);
    globalThis.expect(artifact.tools.length + artifact.hidden.length).toBe(45);
  });

  it('工具名符合 MCP 命名且唯一；id ↔ name 映射规则与锚点一致', () => {
    const seen = new Set();
    for (const tool of artifact.tools) {
      if (!TOOL_NAME_RE.test(tool.name)) throw new Error(`工具名不合规：${tool.name}`);
      if (seen.has(tool.name)) throw new Error(`工具名重复：${tool.name}`);
      seen.add(tool.name);
      globalThis.expect(tool.name).toBe(toToolName(tool.logicalId));
      for (const field of ['title', 'description']) {
        if (typeof tool[field] !== 'string' || tool[field].length === 0) throw new Error(`${tool.name} 缺少 ${field}`);
      }
      if (!tool.inputSchema || tool.inputSchema.type !== 'object') throw new Error(`${tool.name} inputSchema 非对象`);
    }
    const sample = artifact.tools.find((t) => t.logicalId === 'qianhang.intent-detection');
    if (!sample) throw new Error('目录缺少锚点工具 qianhang.intent-detection');
    globalThis.expect(sample.name).toBe('qianhang__intent_detection');
    globalThis.expect(report.names.includes(sample.name)).toBeTruthy();
  });

  it('planned 归零：hidden 为空且 a2a_delegate 已转正可见（P2 激活）', () => {
    globalThis.expect(artifact.hidden.length).toBe(0);
    globalThis.expect(report.hiddenNames.join(',')).toBe('');
    const promoted = artifact.tools.find((t) => t.logicalId === 'shared.a2a-delegate');
    if (!promoted) throw new Error('激活技能未进入可见目录：shared.a2a-delegate');
    globalThis.expect(promoted.name).toBe('shared__a2a_delegate');
  });

  it('与技能索引同源：45 条索引 = 45 可见 + 0 不可见，覆盖集合完全一致', () => {
    globalThis.expect(index.count).toBe(45);
    globalThis.expect(index.entries.length).toBe(45);
    const indexIds = new Set(index.entries.map((e) => e.id));
    const catalogIds = new Set([...artifact.tools, ...artifact.hidden].map((t) => t.logicalId));
    globalThis.expect(catalogIds.size).toBe(indexIds.size);
    for (const id of indexIds) if (!catalogIds.has(id)) throw new Error(`技能未进入工具目录：${id}`);
    for (const id of catalogIds) if (!indexIds.has(id)) throw new Error(`工具目录出现未知技能：${id}`);
    // 索引条目顺序不参与比较；工具目录按 logicalId 升序（确定性）
    const sorted = artifact.tools.map((t) => t.logicalId).join(',');
    const resorted = [...artifact.tools].map((t) => t.logicalId).sort().join(',');
    globalThis.expect(sorted).toBe(resorted);
  });

  it('与能力供给面板同源：tools 45 · skills 45 = 可见 45 + 不可见 0', () => {
    const data = JSON.parse(readFileSync(path.join(ROOT, 'ops/observability/pillar-dashboard/data.json'), 'utf8'));
    if (data.capabilities === undefined) throw new Error('面板 data.json 缺少 capabilities（先执行 pnpm regression）');
    globalThis.expect(data.capabilities.tools).toBe(artifact.count);
    globalThis.expect(data.capabilities.skills).toBe(artifact.count + artifact.hiddenCount);
  });

  it('幂等：重复 --check 结果一致且不写盘', () => {
    const before = readFileSync(path.join(ROOT, ARTIFACT), 'utf8');
    const again = run(['--check', '--json']);
    globalThis.expect(again.status).toBe(0);
    const reportAgain = extractJson(again.stdout);
    globalThis.expect(JSON.stringify(reportAgain)).toBe(JSON.stringify(report));
    globalThis.expect(readFileSync(path.join(ROOT, ARTIFACT), 'utf8')).toBe(before);
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
