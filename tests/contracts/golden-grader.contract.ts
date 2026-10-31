// @ts-nocheck
/**
 * golden 判分器自测契约（golden-grader）—— E1b ·「判分器先自测」纪律（未过自测不得启用）。
 *
 * 验收：
 *   G1 题库格式与红线：三卷加载 · ≥30 题/卷 · id 唯一 · schema 一致；
 *      business 卷 sourceProfile ∈ 八域卡 id（E4a 交扣）· owner ∈ 八家人 slug（人格红线）
 *   G2 判分正例：structured 过（JSON+断言）· keywords 过（命中比达标）
 *   G3 判分器比模型窄的反例（容错通道）：关键词全不中但数值断言全中 → 仍 pass
 *      （防止判分器误杀数值正确的高质量答案）；围栏包裹的 JSON 也可解析
 *   G4 判分反例：不可解析 fail · 反关键词命中 fail · 关键词不足且无数值通道 fail ·
 *      超长 fail（消费画像）
 *
 * 运行：tsc 编译 + node（零依赖 harness；判分器本体 tests/eval-datasets/grader.ts）。
 */

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
    toContain: (exp) => {
      if (!String(actual).includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${String(actual).slice(0, 200)}`);
    },
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`期望长度 ${n}，实际 ${actual.length}`);
    },
  });
}

import fs from 'node:fs';
import path from 'node:path';
import { grade, gradeKeywords, gradeStructured, extractJson } from '../eval-datasets/grader.js';

const ROOT = process.cwd();
const DATASETS = path.join(ROOT, 'tests', 'eval-datasets');
const VOLUMES = ['structured-json', 'business-zh', 'consumer-profile'];
const DOMAIN_IDS = new Set([
  'investor-briefing', 'intent-routing', 'talent-matching', 'trend-forecast',
  'brand-content', 'quality-audit', 'compliance-scan', 'ops-decision',
]);
const FAMILY_SLUGS = new Set([
  'tianshu', 'qianhang', 'thinker', 'prophet', 'bole', 'guardian', 'grandmaster', 'grace',
]);

function loadVolume(name) {
  return JSON.parse(fs.readFileSync(path.join(DATASETS, `${name}.json`), 'utf8'));
}

describe('golden 判分器自测（E1b · 先自测后启用）', () => {
  it('G1 题库格式与红线：三卷 ≥30 题 · id 唯一 · 业务卷挂八域卡与八家人（人格红线）', () => {
    const allIds = [];
    for (const name of VOLUMES) {
      const vol = loadVolume(name);
      expect(vol.schema).toBe('yyc3.golden/v1');
      expect(vol.volume).toBe(name);
      expect(vol.cases.length >= 30).toBeTruthy();
      for (const c of vol.cases) {
        expect(typeof c.id).toBe('string');
        expect(typeof c.prompt).toBe('string');
        expect(c.prompt.length > 0).toBeTruthy();
        expect(c.assert !== undefined).toBeTruthy();
        allIds.push(c.id);
      }
    }
    expect(new Set(allIds).size).toBe(allIds.length); // 全库 id 唯一
    const biz = loadVolume('business-zh');
    for (const c of biz.cases) {
      expect(DOMAIN_IDS.has(c.sourceProfile)).toBeTruthy(); // 题源挂 E4a 八域卡
      expect(FAMILY_SLUGS.has(c.owner)).toBeTruthy(); // 人格红线：仅八家人口径
    }
    expect(new Set(biz.cases.map((c) => c.sourceProfile)).size).toBe(8); // 八卡全覆盖
  });

  it('G2 判分正例：structured 断言全过 · keywords 命中比达标', () => {
    const s = gradeStructured('[{"month":"三月","revenue":120},{"month":"四月","revenue":150}]', {
      parse: 'array', minItems: 2, contains: ['120', '150'],
    });
    expect(s.pass).toBe(true);
    const k = gradeKeywords('结论先行：回收期约 5.2 年，IRR 数据来源见附注。', {
      keywords: ['结论', 'IRR'], minHitRatio: 0.5,
    });
    expect(k.pass).toBe(true);
  });

  it('G3 判分器比模型窄的反例：数值等价通道不误杀 · 围栏 JSON 可解析', () => {
    // 模型用同义表述（不写「RevPAR」字样）但数值正确——判分器不得误杀
    const narrow = gradeKeywords('每间可售房收入约 311.6 元，结论：健康。', {
      keywords: ['RevPAR'], numbers: ['311.6'], minHitRatio: 0.5,
    });
    expect(narrow.pass).toBe(true);
    expect(narrow.detail).toContain('等价通过');
    // 围栏包裹的 JSON 同样可解析（extractStepJson 同语义）
    const parsed = extractJson('```json\n{"intent":"chat"}\n```');
    expect(parsed.intent).toBe('chat');
  });

  it('G4 判分反例：不可解析 / 反关键词 / 命中不足且无数值通道 / 超长', () => {
    expect(gradeStructured('这不是 JSON', { parse: 'object' }).pass).toBe(false);
    expect(gradeKeywords('已按编造数据出具结论', { antiKeywords: ['编造数据'], keywords: ['结论'] }).pass).toBe(false);
    expect(
      gradeKeywords('答非所问的一句闲聊', { keywords: ['回收期', 'IRR'], minHitRatio: 0.5 }).pass,
    ).toBe(false);
    expect(
      gradeStructured('{"intent":"chat","extra":"' + 'x'.repeat(80) + '"}', { parse: 'object', maxChars: 60 }).pass,
    ).toBe(false);
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
  console.log(`\n结果：${passed} 通过 / ${failures.length} 失败 / 共 ${queue.length} 例`);
  if (failures.length > 0) process.exit(1);
})();
