// @ts-nocheck
/**
 * 提示词契约契约测试（prompt.contract）—— P1-T5。
 * 门禁映射：`*.prompt.ts` 内 PROMPT_META（id/version/vars/outputSchema）为唯一事实源，
 *           版本号回写 `presets/family-manifest.yaml` 零漂移；模板对齐蓝图 1206 CO-STAR。
 * 设计：调用真实校验脚本（零依赖、不联网、不写盘），断言其 JSON 结论与文件事实。
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ROOT = process.cwd();
const SCRIPT = 'scripts/check-prompts.mjs';
const INTENT_FILE = 'family-agents/business-layer/member-qianhang/prompts/intent-detection.prompt.ts';
const QUERY_FILE = 'family-agents/business-layer/member-qianhang/prompts/query-parsing.prompt.ts';

/** 从混合输出中提取 JSON（构建环境可能注入调试日志）。 */
function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`未找到 JSON 输出：${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1));
}

const run = spawnSync(process.execPath, [SCRIPT, '--json'], { cwd: ROOT, encoding: 'utf8' });
const report = extractJson(run.stdout ?? '');

const COSTAR_MARKERS = ['【身份】', '【背景】', '【目标】', '【范围】', '【任务】', '【受众】', '【响应】'];

/** 迷你 JSON-Schema 校验（覆盖 outputSchema 所用子集：type 数组/required/properties/边界/items）。 */
function miniValidate(schema, value, path = '$') {
  const errors = [];
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const expected = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : null;
  if (expected && !expected.includes(actual)) return [`${path}: 类型 ${actual} ∉ ${expected.join('|')}`];
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: 低于下界`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: 高于上界`);
  }
  if (schema.type === 'array' && schema.items) {
    value.forEach((item, i) => errors.push(...miniValidate(schema.items, item, `${path}[${i}]`)));
  }
  if (schema.type === 'object' && value && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${path}: 缺少必填字段 ${key}`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (schema.properties?.[key]) errors.push(...miniValidate(schema.properties[key], child, `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}: 不允许的额外字段 ${key}`);
    }
  }
  return errors;
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

describe('提示词契约（P1-T5）', () => {
  it('校验脚本以 0 退出', () => {
    globalThis.expect(run.status).toBe(0);
  });

  it('16 条提示词契约、0 错误', () => {
    globalThis.expect(report.ok).toBe(true);
    globalThis.expect(report.errors.length).toBe(0);
    globalThis.expect(report.stats.prompts).toBe(16);
  });

  it('磁盘全量扫描无孤儿（16 文件 ↔ 16 契约）', () => {
    globalThis.expect(report.stats.files).toBe(16);
    globalThis.expect(report.stats.orphans).toBe(0);
  });

  it('版本零漂移且符合语义化版本', () => {
    globalThis.expect(report.stats.drift).toBe(0);
    for (const p of report.prompts) {
      globalThis.expect(p.version).toBe(p.fileVersion);
      if (!/^\d+\.\d+\.\d+$/.test(p.version ?? '')) throw new Error(`版本号不合规：${p.id}=${p.version}`);
    }
  });

  it('CO-STAR 七要素齐备（意图检测 + 查询解析）', () => {
    for (const file of [INTENT_FILE, QUERY_FILE]) {
      const source = readFileSync(`${ROOT}/${file}`, 'utf8');
      const template = source.match(/export const [A-Z_]+_PROMPT = `([\s\S]*?)`;/)?.[1] ?? '';
      for (const marker of COSTAR_MARKERS) {
        if (!template.includes(marker)) throw new Error(`${file} 缺少 CO-STAR 要素 ${marker}`);
      }
    }
  });

  it('outputSchema 放行合法样本（含 timeRange 对象/空双态）', () => {
    const byId = new Map(report.prompts.map((p) => [p.id, p]));
    const intent = byId.get('qianhang.intent-detection').outputSchema;
    const query = byId.get('qianhang.query-parsing').outputSchema;
    globalThis.expect(miniValidate(intent, { intent: 'analysis', confidence: 0.92, reason: '含分析意图词' }).length).toBe(0);
    globalThis.expect(
      miniValidate(query, { entities: ['华东区'], metrics: ['退货率'], timeRange: null, filters: [], confidence: 0.8 }).length,
    ).toBe(0);
    globalThis.expect(
      miniValidate(query, { entities: [], metrics: [], timeRange: { from: '2026-09-01', to: '2026-09-30' }, filters: [], confidence: 0.5 })
        .length,
    ).toBe(0);
  });

  it('outputSchema 拦截非法样本（置信度越界 + 额外字段）', () => {
    const byId = new Map(report.prompts.map((p) => [p.id, p]));
    const intent = byId.get('qianhang.intent-detection').outputSchema;
    if (miniValidate(intent, { intent: 'analysis', confidence: 1.5, reason: '越界' }).length === 0) {
      throw new Error('置信度 1.5 未被拦截');
    }
    if (miniValidate(intent, { intent: 'x', confidence: 0.5, reason: 'x', extra: 1 }).length === 0) {
      throw new Error('额外字段未被拦截');
    }
  });

  it('vars 与占位符双向对齐（抽查千行两契约）', () => {
    const byId = new Map(report.prompts.map((p) => [p.id, p]));
    const expectVars = (id, names) => {
      const p = byId.get(id);
      if (JSON.stringify(p.vars) !== JSON.stringify(names)) {
        throw new Error(`${id} vars=${JSON.stringify(p.vars)} 期望 ${JSON.stringify(names)}`);
      }
    };
    expectVars('qianhang.intent-detection', ['USER_TEXT', 'INTENT_TYPES', 'SESSION_ID']);
    expectVars('qianhang.query-parsing', ['USER_TEXT', 'SCHEMA_HINT', 'LOCALE']);
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
