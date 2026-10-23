// @ts-nocheck
/**
 * 家族契约清单契约测试（manifest.contract）—— P1-T1。
 * 门禁映射：`presets/family-manifest.yaml` 为唯一事实源，8 位家人的规范性字段
 *           必须与各自 agent.yaml 零漂移；技能目录与协同矩阵必须自洽。
 * 设计：调用真实校验脚本（零依赖、不联网、不写盘），断言其 JSON 结论。
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const ROOT = process.cwd();
const SCRIPT = 'scripts/check-manifest.mjs';

/** 从混合输出中提取 JSON（构建环境可能注入调试日志）。 */
function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`未找到 JSON 输出：${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1));
}

const run = spawnSync(process.execPath, [SCRIPT, '--json'], { cwd: ROOT, encoding: 'utf8' });
const report = extractJson(run.stdout ?? '');

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

describe('家族契约清单（P1-T1）', () => {
  it('校验脚本以 0 退出', () => {
    globalThis.expect(run.status).toBe(0);
  });

  it('结构校验无错误', () => {
    globalThis.expect(report.ok).toBe(true);
    globalThis.expect(report.errors.length).toBe(0);
  });

  it('家人数量为 8', () => {
    globalThis.expect(report.stats.agents).toBe(8);
  });

  it('技能目录为 45（共用 13 / 专用 32）', () => {
    globalThis.expect(report.stats.skills).toBe(45);
    globalThis.expect(report.stats.shared).toBe(13);
    globalThis.expect(report.stats.dedicated).toBe(32);
  });

  it('协同矩阵含 56 条委托边', () => {
    globalThis.expect(report.stats.delegationEdges).toBe(56);
  });

  it('与八份 agent.yaml 漂移为 0', () => {
    globalThis.expect(report.stats.drift).toBe(0);
  });

  it('清单文件存在于 presets/', () => {
    globalThis.expect(existsSync(`${ROOT}/presets/family-manifest.yaml`)).toBe(true);
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
