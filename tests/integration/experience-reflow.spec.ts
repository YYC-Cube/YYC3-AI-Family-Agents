// @ts-nocheck
/**
 * Phase C 集成测试 —— 经验回流闭环（learning-loop 首条学习回路）。
 *
 * 覆盖目标（《架构设计.md》§6.4 Phase C）：
 *   1. 标注器：宗师 goldenPass 为最可靠标签；低置信成功 → partial（待回归）
 *   2. 采集器：judgment 随链路关联、drain 清空
 *   3. 提炼器：成功样本成簇、失败反证抑制、样本数阈值、确定性排序
 *   4. 全回路：轨迹 → 模式 → 技能固化 v1.0.0 → 二次周期 minor 升级
 *   5. 稳定性红线：回归失败 → 回滚（rolled-back），技能永不以未验证状态 active
 *   6. 预算约束：每周期固化上限
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
    toBeCloseTo: (exp, digits = 6) => {
      if (Math.abs(actual - exp) >= Math.pow(10, -digits) / 2) {
        throw new Error(`期望 ≈ ${exp}（精度 ${digits}），实际 ${actual}`);
      }
    },
    toBeGreaterThan: (exp) => {
      if (!(actual > exp)) throw new Error(`期望 > ${exp}，实际 ${actual}`);
    },
    toBeGreaterThanOrEqual: (exp) => {
      if (!(actual >= exp)) throw new Error(`期望 ≥ ${exp}，实际 ${actual}`);
    },
    toBeLessThan: (exp) => {
      if (!(actual < exp)) throw new Error(`期望 < ${exp}，实际 ${actual}`);
    },
    toBeTruthy: () => {
      if (!actual) throw new Error(`期望真值，实际 ${JSON.stringify(actual)}`);
    },
    toBeUndefined: () => {
      if (actual !== undefined) throw new Error(`期望 undefined，实际 ${JSON.stringify(actual)}`);
    },
    toContain: (exp) => {
      if (!actual.includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${JSON.stringify(actual)}`);
    },
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`期望长度 ${n}，实际 ${actual.length}`);
    },
  });
}

import { OutcomeLabeler } from '../../architecture-kernel/05-持续学习引擎/experience-reflow/outcome-labeler.js';
import { PatternExtractor } from '../../architecture-kernel/05-持续学习引擎/experience-reflow/pattern-extractor.js';
import { TrajectoryCollector } from '../../architecture-kernel/05-持续学习引擎/experience-reflow/trajectory-collector.js';
import { InMemorySkillStore, LearningLoop } from '../../architecture-kernel/05-持续学习引擎/learning-loop.js';

let seq = 0;

/** 构造回流输入（宗师质量判定轨迹 + 外验标签）。 */
function item(signature, opts = {}) {
  seq += 1;
  const id = `t-${seq}`;
  return {
    event: {
      traceId: id,
      agent: opts.agent ?? 'grandmaster',
      taskType: opts.taskType ?? 'quality-judgment',
      steps: signature.map((tool, i) => ({ order: i + 1, action: `step-${i + 1}`, tool, ok: true })),
      startedAt: seq * 10,
      finishedAt: seq * 10 + 5,
      completed: opts.completed ?? true,
      judgment:
        opts.confidence !== undefined
          ? { agent: opts.agent ?? 'grandmaster', confidence: opts.confidence, uncertaintySources: [], assumptions: [], escalation: 'none' }
          : undefined,
    },
    goldenPass: opts.goldenPass,
  };
}

describe('Phase C · 经验回流闭环（learning-loop）', () => {
  it('T1 标注器：goldenPass 是最可靠标签（true→success，false→failure）', () => {
    const labeler = new OutcomeLabeler();
    const ok = item(['sast'], {});
    expect(labeler.label(ok.event, { goldenPass: true }).label).toBe('success');
    const bad = item(['sast'], {});
    expect(labeler.label(bad.event, { goldenPass: false }).label).toBe('failure');
  });

  it('T2 标注器：低置信成功 → partial（高价值素材，待回归验证）', () => {
    const labeler = new OutcomeLabeler();
    const low = item(['sast'], { confidence: 0.4 });
    const r = labeler.label(low.event);
    expect(r.label).toBe('partial');
    expect(r.rationale).toContain('低置信');
  });

  it('T3 采集器：judgment 关联入库，drain 清空缓冲', () => {
    const c = new TrajectoryCollector();
    c.collect(item(['a', 'b'], { confidence: 0.9 }).event);
    c.collect(item(['a', 'b'], { confidence: 0.9 }).event);
    expect(c.size()).toBe(2);
    const drained = c.drain();
    expect(drained).toHaveLength(2);
    expect(drained[0].judgment.confidence).toBe(0.9);
    expect(c.size()).toBe(0);
  });

  it('T4 提炼器：成功成簇（3 成功 → 模式，置信度 0.8），单样本不成簇', () => {
    const ex = new PatternExtractor();
    const mk = (label) => ({ trajectory: item(['sast', 'lint']).event, label, rationale: '' });
    const patterns = ex.extract([mk('success'), mk('success'), mk('success')]);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].confidence).toBeCloseTo(0.8);
    expect(patterns[0].supportingTraces).toHaveLength(3);
    // 单样本不成簇
    expect(ex.extract([mk('success')])).toHaveLength(0);
  });

  it('T5 提炼器：失败反证（2 成功 + 1 失败 → 成功率 0.67 < 0.8 → 无模式）', () => {
    const ex = new PatternExtractor();
    const mk = (label) => ({ trajectory: item(['sast', 'lint']).event, label, rationale: '' });
    expect(ex.extract([mk('success'), mk('success'), mk('failure')])).toHaveLength(0);
  });

  it('T6 全回路周期一：3 条宗师通过轨迹 → 模式 → 技能固化 v1.0.0', () => {
    const store = new InMemorySkillStore();
    const loop = new LearningLoop(store, {
      regressionCases: [{ id: 'r1', expected: 'ok' }],
      evaluate: () => 'ok',
    });
    loop.ingest([
      item(['sast', 'lint'], { goldenPass: true }),
      item(['sast', 'lint'], { goldenPass: true }),
      item(['sast', 'lint'], { goldenPass: true }),
    ]);
    const report = loop.runCycle();
    expect(report.patterns).toHaveLength(1);
    expect(report.promoted).toHaveLength(1);
    expect(report.promoted[0].version).toBe('1.0.0');
    expect(report.promoted[0].status).toBe('active');
    expect(report.rolledBack).toHaveLength(0);
    // 固化技能的 when/steps 溯源自模式三元组
    expect(report.promoted[0].when[0]).toContain('grandmaster');
    expect(report.promoted[0].steps).toHaveLength(2);
    expect(store.activeSkills()).toHaveLength(1);
  });

  it('T7 全回路周期二：同簇新证据 → minor 升级 v1.1.0，旧版本降级 deprecated', () => {
    const store = new InMemorySkillStore();
    const loop = new LearningLoop(store, {
      regressionCases: [{ id: 'r1', expected: 'ok' }],
      evaluate: () => 'ok',
    });
    loop.ingest([item(['sast', 'lint'], { goldenPass: true }), item(['sast', 'lint'], { goldenPass: true })]);
    loop.runCycle();
    loop.ingest([item(['sast', 'lint'], { goldenPass: true }), item(['sast', 'lint'], { goldenPass: true })]);
    const report = loop.runCycle();
    expect(report.promoted).toHaveLength(1);
    expect(report.promoted[0].version).toBe('1.1.0');
    const hist = store.historyOf(report.promoted[0].id);
    expect(hist).toHaveLength(2);
    expect(hist.find((s) => s.version === '1.0.0').status).toBe('deprecated');
    expect(store.activeSkills()).toHaveLength(1);
    expect(store.activeSkills()[0].version).toBe('1.1.0');
  });

  it('T8 稳定性红线：回归失败 → 技能回滚，永不以未验证状态 active', () => {
    const store = new InMemorySkillStore();
    const loop = new LearningLoop(store, {
      regressionCases: [{ id: 'r1', expected: 'ok' }],
      evaluate: () => 'regression-broken', // 模拟新技能破坏既有能力
    });
    loop.ingest([item(['newtool'], { goldenPass: true }), item(['newtool'], { goldenPass: true })]);
    const report = loop.runCycle();
    expect(report.promoted).toHaveLength(0);
    expect(report.rolledBack).toHaveLength(1);
    expect(report.rolledBack[0].version).toBe('1.0.0');
    expect(report.rolledBack[0].restored).toBeUndefined(); // 无前置版本可恢复
    expect(report.regressions[0].passed).toBe(false);
    expect(report.regressions[0].regressions).toHaveLength(1); // r1 新增退化
    expect(store.activeSkills()).toHaveLength(0); // 红线：未验证技能不得 active
    expect(store.historyOf(report.rolledBack[0].skillId)[0].status).toBe('rolled-back');
  });

  it('T9 预算约束：maxPromotionsPerCycle=1 时多模式只固化 1 个（置信度优先）', () => {
    const store = new InMemorySkillStore();
    const loop = new LearningLoop(store, { maxPromotionsPerCycle: 1 });
    loop.ingest([
      item(['sast'], { goldenPass: true }),
      item(['sast'], { goldenPass: true }),
      item(['sast'], { goldenPass: true }),
      item(['lint'], { goldenPass: true }),
      item(['lint'], { goldenPass: true }),
      item(['lint'], { goldenPass: true }),
      item(['lint'], { goldenPass: true }),
    ]);
    const report = loop.runCycle();
    expect(report.patterns).toHaveLength(2);
    expect(report.promoted).toHaveLength(1);
    // lint 簇 4 样本置信度更高 → 优先固化
    expect(report.promoted[0].sourcePattern.strategy).toBe('lint');
  });

  it('T10 失败轨迹不产生模式（只有宗师未通过的负样本）', () => {
    const store = new InMemorySkillStore();
    const loop = new LearningLoop(store);
    loop.ingest([item(['sast'], { goldenPass: false }), item(['sast'], { goldenPass: false })]);
    const report = loop.runCycle();
    expect(report.patterns).toHaveLength(0);
    expect(report.promoted).toHaveLength(0);
  });
});

// ---- 纯 node 异步 harness（vitest 环境下不生效）----
if (__localShim) {
  (async () => {
    let passed = 0;
    let failed = 0;
    for (const c of globalThis.__queue) {
      try {
        await c.fn();
        passed += 1;
        console.log(`PASS  ${c.name}`);
      } catch (e) {
        failed += 1;
        console.log(`FAIL  ${c.name}\n      ${(e as Error).message}`);
      }
    }
    console.log(`\n结果：${passed} 通过 / ${failed} 失败 / 共 ${passed + failed} 例`);
    if (failed > 0) process.exit(1);
  })();
}
