// @ts-nocheck
/**
 * 技能生命周期测试（skill-lifecycle）—— P8-a（M25）· C 类第一批三件转实 + P8 收尾 a 装配位。
 *
 * 验收：
 *   F1 固化阈值：support/confidence 任一不达 → undefined；达标 → 确定性定义
 *      （id = skill-<8hex> 稳定哈希 · steps 三段式 · sourcePattern 溯源）
 *   F2 固化确定性：同模式两次 merge 字段全同；不同模式 id 不同
 *   F3 写入请求：layer=procedural · payload 原样 · provenance 溯源
 *   F4 淘汰候选：空闲超阈 OR 频次过低；protectedIds 豁免；活跃技能不出候选
 *   F5 退化检测：delta > maxDecay 判退化；报告字段完整；边界（= maxDecay）不判
 *   F6 固化落位适配（P8 收尾 a）：steps 序号化 · logicalId 归并（FNV → learned.*）
 *      · 显式声明优先 · 内核专有字段不外带
 *   F7 merger→registry 装配位：周期晋升技能经适配注册进 SkillRegistry（可查）
 *   F8 落位幂等与升级：同 logicalId 二次晋升注册表多版本共存，latest 取最新
 *
 * 运行：tsc 编译 + node（零依赖 harness，范式同 learning-scheduler）。
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
    toBeFalsy: () => {
      if (actual) throw new Error(`期望假值，实际 ${JSON.stringify(actual)}`);
    },
    toContain: (exp) => {
      if (!actual.includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${String(actual).slice(0, 200)}`);
    },
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`期望长度 ${n}，实际 ${actual.length}`);
    },
  });
}

import { SkillMerger } from '../../architecture-kernel/05-持续学习引擎/skill-consolidation/skill-merger.js';
import { SkillPruner, DEFAULT_PRUNE_POLICY } from '../../architecture-kernel/05-持续学习引擎/skill-consolidation/skill-pruner.js';
import { ForgettingDetector } from '../../architecture-kernel/05-持续学习引擎/stability-guard/forgetting-detector.js';
import { InMemorySkillStore } from '../../architecture-kernel/05-持续学习引擎/learning-loop.js';
import {
  createRuntimeAssembly,
  consolidatedSkillForRegistry,
} from '../../architecture-kernel/08-系统装配/runtime-assembly.js';
import { SkillRegistry } from '../../family-agents/shared-core/memory-framework/procedural-memory/skill-registry.js';

const PATTERN = {
  condition: '月度经营分析请求',
  strategy: '先取口径再对比环比',
  outcome: '结论一次通过',
  supportingTraces: ['t1', 't2', 't3', 't4'],
  confidence: 0.9,
};

const skill = (over = {}) => ({
  id: 'skill-abcdef01',
  name: '示例技能',
  version: '1.0.0',
  description: 'd',
  when: [],
  steps: [],
  status: 'active',
  createdAt: 0,
  useCount: 10,
  lastUsedAt: 1_000,
  ...over,
});

describe('技能生命周期（P8-a · M25 · 固化/淘汰/退化）', () => {
  it('F1 固化阈值：不达阈值不固化；达标产出确定性定义', () => {
    const merger = new SkillMerger();
    expect(merger.merge({ ...PATTERN, supportingTraces: ['t1'] }, 1)).toBe(undefined);
    expect(merger.merge({ ...PATTERN, confidence: 0.5 }, 1)).toBe(undefined);
    const def = merger.merge(PATTERN, 5_000);
    expect(def).toBeTruthy();
    expect(/^skill-[0-9a-f]{8}$/.test(def.id)).toBeTruthy();
    expect(def.version).toBe('0.1.0');
    expect(def.steps).toHaveLength(3);
    expect(def.steps[0]).toContain('月度经营分析请求');
    expect(def.when[0]).toBe(PATTERN.condition);
    expect(def.sourcePattern).toBe(PATTERN);
    expect(def.createdAt).toBe(5_000);
    expect(def.useCount).toBe(4);
  });

  it('F2 固化确定性：同模式两次全同；不同模式 id 不同', () => {
    const merger = new SkillMerger();
    const a1 = merger.merge(PATTERN, 1);
    const a2 = merger.merge(PATTERN, 999); // createdAt 注入不同，其余全同
    expect(a1.id).toBe(a2.id);
    expect(a1.steps.join('|')).toBe(a2.steps.join('|'));
    const b = merger.merge({ ...PATTERN, strategy: '另一策略' }, 1);
    expect(b.id === a1.id).toBeFalsy();
  });

  it('F3 写入请求：layer=procedural · payload 原样 · provenance 溯源', () => {
    const merger = new SkillMerger();
    const def = merger.merge(PATTERN, 1);
    const req = merger.toWriteRequest(def);
    expect(req.layer).toBe('procedural');
    expect(req.payload).toBe(def);
    expect(req.provenance.agent).toBe('learning-engine');
    expect(req.provenance.traceId).toBe(def.id);
    expect(typeof req.provenance.ts).toBe('number');
    expect(req.salience).toBe(0.8);
  });

  it('F4 淘汰候选：空闲超阈 OR 频次过低；protectedIds 豁免；活跃不出候选', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const now = 100 * DAY;
    const pruner = new SkillPruner({
      ...DEFAULT_PRUNE_POLICY,
      maxIdleMs: 90 * DAY,
      minUseCount: 1,
      protectedIds: ['skill-keep'],
    });
    const idle = skill({ id: 'skill-idle', lastUsedAt: now - 91 * DAY, useCount: 50 });
    const rarelyUsed = skill({ id: 'skill-rare', lastUsedAt: now - 1 * DAY, useCount: 0 });
    const active = skill({ id: 'skill-active', lastUsedAt: now - 1 * DAY, useCount: 20 });
    const guarded = skill({ id: 'skill-keep', lastUsedAt: 0, useCount: 0 });
    const ids = pruner.select([idle, rarelyUsed, active, guarded], now);
    expect(ids.join(',')).toBe('skill-idle,skill-rare');
  });

  it('F5 退化检测：delta > maxDecay 判退化；边界不判；报告完整', () => {
    const detector = new ForgettingDetector(0.05);
    const base = { skillId: 'skill-x', passRate: 0.92, recordedAt: 1 };
    const bad = detector.detect(base, 0.80);
    expect(bad.degraded).toBeTruthy();
    if (Math.abs(bad.delta - 0.12) > 1e-9) throw new Error('delta 口径异常');
    expect(bad.before).toBe(0.92);
    expect(bad.after).toBe(0.80);
    const edge = detector.detect(base, 0.87); // delta = 0.05 = maxDecay，不超过
    expect(edge.degraded).toBeFalsy();
    const ok = detector.detect(base, 0.95); // 提升
    expect(ok.degraded).toBeFalsy();
    expect(ok.delta < 0).toBeTruthy();
  });

  it('F6 固化落位适配：steps 序号化 · logicalId 归并 · 内核专有字段不外带', () => {
    const merger = new SkillMerger();
    const def = merger.merge(PATTERN, 1); // FNV 主键 · 无显式 logicalId
    const draft = consolidatedSkillForRegistry(def);
    expect(draft.logicalId).toBe(`learned.${def.id}`); // FNV 遗留归并约定（skill-id.ts）
    expect(draft.id).toBe(def.id);
    expect(draft.name).toBe(def.name);
    expect(draft.version).toBe(def.version);
    expect(draft.status).toBe('active');
    expect(draft.steps).toHaveLength(3);
    expect(draft.steps[0].order).toBe(1);
    expect(draft.steps[0].action).toBe(def.steps[0]);
    expect(draft.steps[2].order).toBe(3);
    expect('sourcePattern' in draft).toBeFalsy(); // 内核专有字段不外带
    expect('useCount' in draft).toBeFalsy();
    expect('createdAt' in draft).toBeFalsy();
    const explicit = consolidatedSkillForRegistry({ ...def, logicalId: 'learned.qianhang.demo' });
    expect(explicit.logicalId).toBe('learned.qianhang.demo'); // 显式声明优先
  });

  it('F7 merger→registry 装配位：周期晋升技能经适配注册进 SkillRegistry 可查', () => {
    const registry = new SkillRegistry();
    const a = createRuntimeAssembly({ store: new InMemorySkillStore(), skillRegistry: registry });
    const traj = (i) => ({
      traceId: `t-${i}`,
      agent: 'qianhang',
      taskType: '经营分析',
      steps: [{ order: 1, action: '取数', ok: true }],
      startedAt: i,
      finishedAt: i + 1,
      completed: true,
    });
    a.loop.ingest([1, 2, 3, 4].map((i) => ({ event: traj(i), goldenPass: true })));
    const report = a.loop.runCycle({ minSamples: 2, minSuccessRate: 0.5 });
    expect(report.promoted).toHaveLength(1);
    const promoted = report.promoted[0];
    const found = registry.findByLogicalId(`learned.${promoted.id}`); // 归并 id 可查
    expect(found).toBeTruthy();
    expect(found.id).toBe(promoted.id);
    expect(found.steps[0].order).toBe(1);
    expect(found.steps[0].action).toBe(promoted.steps[0]);
    expect(found.version).toBe(promoted.version);
    expect(registry.get(promoted.id).status).toBe('active');
  });

  it('F8 落位幂等与升级：同 logicalId 二次晋升注册表多版本共存，latest 取最新', () => {
    const registry = new SkillRegistry();
    let seq = 0;
    const a = createRuntimeAssembly({
      store: new InMemorySkillStore(),
      skillRegistry: registry,
      learning: { logicalIdResolver: () => 'learned.qianhang.demo' },
    });
    const feed = () => {
      seq += 1;
      a.loop.ingest(
        [1, 2, 3].map((i) => ({
          event: {
            traceId: `x-${seq}-${i}`,
            agent: 'qianhang',
            taskType: '经营分析',
            steps: [{ order: 1, action: '取数', ok: true }],
            startedAt: i,
            finishedAt: i + 1,
            completed: true,
          },
          goldenPass: true,
        })),
      );
    };
    feed();
    a.loop.runCycle({ minSamples: 2, minSuccessRate: 0.5 });
    feed();
    const report2 = a.loop.runCycle({ minSamples: 2, minSuccessRate: 0.5 });
    expect(report2.promoted).toHaveLength(1);
    expect(report2.promoted[0].version).toBe('1.1.0'); // versioner minor 递增
    const found = registry.findByLogicalId('learned.qianhang.demo'); // latest 归最新
    expect(found.version).toBe('1.1.0');
    expect(registry.get(found.id, '1.0.0')).toBeTruthy(); // 注册表多版本共存
    expect(registry.get(found.id, '1.1.0')).toBeTruthy();
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
