// @ts-nocheck
/**
 * 技能行为评测（skill-behavior-eval）—— P3-T5。
 * 门禁映射：`tests/skills/` 金样例（给定输入 → 期望触发 + 产出必含字段）——
 *   覆盖零漂移：每条 `status: active` 技能 ≥1 例，金样例 ↔ 清单 active 集双向相等；
 *   评测默认 observe：行为偏差仅记录不阻断（kernel skill-eval 契约 + enforce 路径单测）。
 * 设计：评测为纯函数（无 IO / 无网络 / 无 LLM）；金样例为提交资产，可人工精化。
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  enforceEvalOutcome,
  evaluateSkillCase,
  outputShapeOk,
  skillTriggersOn,
  summarizeEval,
  SKILL_EVAL_MODE,
} from '../../architecture-kernel/05-持续学习引擎/skill-consolidation/skill-eval.js';
import { SkillRegistry } from '../../family-agents/shared-core/memory-framework/procedural-memory/skill-registry.js';

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
const ACTIVE_IDS = new Set(
  MANIFEST_SKILLS.filter((s) => s.status !== 'planned').map((s) => s.id),
);

/** 金样例资产（提交件，可人工精化；此处只读加载）。 */
const GOLDEN = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/skills/golden.json'), 'utf8'));

/** 观测用注册表：真实清单装载（与 P3-T3 加载器同一路径）。 */
const registry = new SkillRegistry();
registry.loadFromManifest(MANIFEST_SKILLS);

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

describe('技能行为评测（P3-T5 · observe）', () => {
  it('金样例资产：44 例、字段完备、mode=observe、id 严格升序唯一', () => {
    globalThis.expect(GOLDEN.mode).toBe('observe');
    globalThis.expect(GOLDEN.count).toBe(44);
    globalThis.expect(GOLDEN.cases.length).toBe(44);
    for (let i = 0; i < GOLDEN.cases.length; i += 1) {
      const c = GOLDEN.cases[i];
      if (!c.id || typeof c.input !== 'string') throw new Error(`金样例缺 id/input：${c.id}`);
      if (typeof c.expectTrigger !== 'boolean') throw new Error(`金样例 expectTrigger 非布尔：${c.id}`);
      if (!Array.isArray(c.requiredOutput) || c.requiredOutput.length === 0) {
        throw new Error(`金样例 requiredOutput 为空：${c.id}`);
      }
      if (i > 0 && !(GOLDEN.cases[i - 1].id < c.id)) {
        throw new Error(`金样例未按 id 严格升序：${GOLDEN.cases[i - 1].id} → ${c.id}`);
      }
    }
  });

  it('覆盖零漂移：active 技能集合 ↔ 金样例 id 集合双向相等（44/44，planned 不入）', () => {
    const goldenIds = new Set(GOLDEN.cases.map((c) => c.id));
    globalThis.expect(goldenIds.size).toBe(44);
    globalThis.expect(ACTIVE_IDS.size).toBe(44);
    for (const id of ACTIVE_IDS) {
      if (!goldenIds.has(id)) throw new Error(`active 技能缺金样例：${id}`);
    }
    for (const id of goldenIds) {
      if (!ACTIVE_IDS.has(id)) throw new Error(`金样例引用非 active 技能：${id}`);
    }
    if (goldenIds.has('shared.a2a-delegate')) throw new Error('planned 技能不应有金样例：shared.a2a-delegate');
  });

  it('skillTriggersOn：when 词元命中触发 / 无关输入不触发 / 空 when 与空输入不触发', () => {
    globalThis.expect(skillTriggersOn(['识别意图并给置信度'], '帮我做意图识别')).toBe(true);
    globalThis.expect(skillTriggersOn(['识别意图并给置信度'], 'qwikzorg 无关探针')).toBe(false);
    globalThis.expect(skillTriggersOn([], '任意输入')).toBe(false);
    globalThis.expect(skillTriggersOn(['条件'], '')).toBe(false);
  });

  it('outputShapeOk：全字段非空通过；缺字段 / null / 空串 / 非对象拒绝', () => {
    globalThis.expect(outputShapeOk({ skillId: 'a.b', ok: true }, ['skillId', 'ok'])).toBe(true);
    globalThis.expect(outputShapeOk({ skillId: 'a.b' }, ['skillId', 'ok'])).toBe(false);
    globalThis.expect(outputShapeOk({ skillId: 'a.b', ok: null }, ['skillId', 'ok'])).toBe(false);
    globalThis.expect(outputShapeOk({ skillId: 'a.b', ok: '' }, ['skillId', 'ok'])).toBe(false);
    globalThis.expect(outputShapeOk(undefined, ['skillId'])).toBe(false);
  });

  it('evaluateSkillCase：全绿零违规；触发不符 / 步骤缺项 / 结构缺失分别记录', () => {
    const skill = { id: 'x.y', when: ['识别意图'], steps: [{ action: 'detect' }, { action: 'score' }] };
    const ok = evaluateSkillCase(skill, { skillId: 'x.y', ok: true }, {
      id: 'x.y',
      input: '做意图识别',
      expectTrigger: true,
      steps: ['detect', 'score'],
      requiredOutput: ['skillId', 'ok'],
    });
    globalThis.expect(ok.violations.length).toBe(0);
    globalThis.expect(ok.triggerOk).toBe(true);
    globalThis.expect(ok.stepsOk).toBe(true);
    globalThis.expect(ok.outputOk).toBe(true);

    const bad = evaluateSkillCase({ when: ['其他领域'], steps: [] }, { skillId: 'x.y' }, {
      id: 'x.y',
      input: '完全无关',
      expectTrigger: true,
      steps: ['missing-step'],
      requiredOutput: ['skillId', 'data'],
    });
    globalThis.expect(bad.triggerOk).toBe(false);
    globalThis.expect(bad.stepsOk).toBe(false);
    globalThis.expect(bad.outputOk).toBe(false);
    globalThis.expect(bad.violations.length).toBe(3);
  });

  it('observe 全量执行：44 例两阶段评测，结构合法 44，汇总与明细一致，偏差仅记录不失败', () => {
    const outcomes = [];
    for (const c of GOLDEN.cases) {
      const skill = registry.findByLogicalId(c.id);
      if (skill === undefined) {
        outcomes.push(evaluateSkillCase({ when: [] }, undefined, c));
        continue;
      }
      // 产出信封：评测对象为技能行为面；真实执行器由后续轮接入（observe 基线）
      outcomes.push(evaluateSkillCase(skill, { skillId: c.id, ok: true }, c));
    }
    const summary = summarizeEval(outcomes);
    globalThis.expect(summary.total).toBe(44);
    globalThis.expect(summary.outputOk).toBe(44); // 全部命中注册表且信封结构合法
    // 汇总口径与明细逐项一致（报表可信性）
    let triggered = 0;
    let triggerOk = 0;
    let deviations = 0;
    for (const o of outcomes) {
      if (o.triggered) triggered += 1;
      if (o.triggerOk) triggerOk += 1;
      if (o.violations.length > 0) deviations += 1;
    }
    globalThis.expect(summary.triggered).toBe(triggered);
    globalThis.expect(summary.triggerOk).toBe(triggerOk);
    globalThis.expect(summary.deviations).toBe(deviations);
    // observe：偏差打印不阻断（若存在偏差，逐条透出供人工精化金样例）
    if (deviations > 0) {
      for (const o of outcomes) {
        if (o.violations.length > 0) console.log(`⚠ observe 偏差 ${o.id}：${o.violations.join('；')}`);
      }
    }
    console.log(`📊 行为评测 observe：44 例 · 触发命中 ${summary.triggered} · 触发符合期望 ${summary.triggerOk} · 结构合法 ${summary.outputOk} · 偏差 ${summary.deviations} 条（不阻断）`);
    globalThis.expect(SKILL_EVAL_MODE).toBe('observe');
  });

  it('确定性：同 case 重复评测结果逐字段相等（纯函数无隐含状态）', () => {
    const skill = registry.findByLogicalId('qianhang.intent-detection');
    const c = GOLDEN.cases.find((x) => x.id === 'qianhang.intent-detection');
    const a = evaluateSkillCase(skill, { skillId: c.id, ok: true }, c);
    const b = evaluateSkillCase(skill, { skillId: c.id, ok: true }, c);
    globalThis.expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('enforce 路径：违规即抛（含技能 id 与偏差明细），干净结论原样返回', () => {
    const bad = {
      id: 'x.bad',
      input: 'in',
      triggered: false,
      triggerOk: false,
      stepsOk: true,
      outputOk: true,
      violations: ['触发判定不符：期望 触发，实际 未触发'],
    };
    let threw = null;
    try {
      enforceEvalOutcome(bad);
    } catch (e) {
      threw = e instanceof Error ? e.message : String(e);
    }
    if (threw === null) throw new Error('enforce 未抛错');
    if (!threw.includes('x.bad') || !threw.includes('触发判定不符')) throw new Error(`enforce 错误信息不全：${threw}`);
    const good = { ...bad, triggerOk: true, violations: [] };
    globalThis.expect(enforceEvalOutcome(good).id).toBe('x.bad');
  });

  it('金样例输入与清单 examples 同源：44 例输入均来自该技能首个示例（基线可追溯）', () => {
    for (const c of GOLDEN.cases) {
      const entry = MANIFEST_SKILLS.find((s) => s.id === c.id);
      if (entry === undefined) throw new Error(`清单缺技能：${c.id}`);
      const first = (entry.examples ?? [''])[0] ?? '';
      globalThis.expect(c.input).toBe(first);
      globalThis.expect(c.expectTrigger).toBe(first.length > 0);
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
