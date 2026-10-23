// @ts-nocheck
/**
 * 五维指标映射契约测试（five-dimension-metrics.spec）—— P1-T4。
 * 覆盖：
 *   D1 指标总量：运行时 14 + 协同 4 = 18（≤18 上限）
 *   D2 映射完整性：14 项运行时指标各归属唯一主维；2 项 CI 指标亦在册
 *   D3 五维分布：时间 3 / 空间 2 / 属性 4 / 事件 4 / 关联 3
 *   D4 协同 4 项默认零样本（不污染 /metrics 默认口径）
 *   D5 协同比率折算：命中 / 总数，写入 Gauge 与暴露文本
 *   D6 告警契约：4 条 alert 且各引用对应指标
 */

import { readFileSync } from 'node:fs';
import { FamilyMetrics } from '../../architecture-kernel/09-可观测性/family-metrics.js';

const ROOT = process.cwd();
const MAP = JSON.parse(readFileSync(`${ROOT}/assets/schemas/five-dimension-map.json`, 'utf8'));
const RULES = readFileSync(`${ROOT}/ops/observability/prometheus-rules.yaml`, 'utf8');

const COLLABORATION = [
  'family_collaboration_clarify_rate',
  'family_collaboration_human_confirm_rate',
  'family_collaboration_trace_coverage',
  'family_collaboration_replay_coverage',
];

/** 暴露文本中的指标名（取自 # HELP 行）。 */
function helpNames(text) {
  return text
    .split('\n')
    .filter((line) => line.startsWith('# HELP '))
    .map((line) => line.split(' ')[2]);
}

const DIMENSION_NAMES = MAP.dimensions.flatMap((dimension) => dimension.metrics);
const CI_ONLY = ['family_regression_gate_failed_total', 'family_pillar_failed_cases'];

// ---------- 零依赖 harness ----------

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
    toBeCloseTo: (exp, digits = 4) => {
      if (Math.abs(actual - exp) >= Math.pow(10, -digits)) {
        throw new Error(`期望 ≈ ${exp}（精度 ${digits}），实际 ${actual}`);
      }
    },
    toContain: (exp) => {
      if (!actual.includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}`);
    },
  });
}

describe('五维指标映射（P1-T4）', () => {
  it('D1: 运行时指标总数为 18（14 业务 + 4 协同）', () => {
    const names = helpNames(new FamilyMetrics().render());
    globalThis.expect(names.length).toBe(18);
    for (const name of COLLABORATION) globalThis.expect(names.includes(name)).toBe(true);
  });

  it('D2: 14 项运行时指标全部归属唯一主维', () => {
    const runtime = helpNames(new FamilyMetrics().render()).filter((name) => !COLLABORATION.includes(name));
    const mapped = new Set(DIMENSION_NAMES);
    for (const name of runtime) globalThis.expect(mapped.has(name)).toBe(true);
    // 映射表 = 运行时 14 + CI 2
    const extra = DIMENSION_NAMES.filter((name) => !runtime.includes(name));
    globalThis.expect(extra.sort().join(',')).toBe(CI_ONLY.sort().join(','));
    // 唯一归属：无重复
    globalThis.expect(new Set(DIMENSION_NAMES).size).toBe(DIMENSION_NAMES.length);
  });

  it('D3: 五维分布为 时间 3 / 空间 2 / 属性 4 / 事件 4 / 关联 3', () => {
    const byId = Object.fromEntries(MAP.dimensions.map((dimension) => [dimension.id, dimension.metrics.length]));
    globalThis.expect(MAP.dimensions.length).toBe(5);
    globalThis.expect(byId.time).toBe(3);
    globalThis.expect(byId.space).toBe(2);
    globalThis.expect(byId.attribute).toBe(4);
    globalThis.expect(byId.event).toBe(4);
    globalThis.expect(byId.association).toBe(3);
  });

  it('D4: 协同 4 项默认零样本（仅 HELP/TYPE，无样本行）', () => {
    const metrics = new FamilyMetrics();
    const text = metrics.render();
    for (const name of COLLABORATION) {
      globalThis.expect(text.includes(`# HELP ${name} `)).toBe(true);
      globalThis.expect(text.split('\n').some((line) => line.startsWith(`${name} `))).toBe(false);
    }
    const snapshot = metrics.collaborationSnapshot();
    globalThis.expect(snapshot.clarification.total).toBe(0);
    globalThis.expect(snapshot['human-confirm'].rate).toBe(0);
  });

  it('D5: 协同比率按命中/总数折算并暴露', () => {
    const metrics = new FamilyMetrics();
    for (let i = 0; i < 5; i += 1) metrics.recordCollaboration('clarification', i < 2);
    for (let i = 0; i < 3; i += 1) metrics.recordCollaboration('human-confirm', i === 0);
    for (let i = 0; i < 20; i += 1) metrics.recordCollaboration('trace', i < 19);
    for (let i = 0; i < 10; i += 1) metrics.recordCollaboration('replay', i < 3);

    const snapshot = metrics.collaborationSnapshot();
    globalThis.expect(snapshot.clarification.total).toBe(5);
    globalThis.expect(snapshot.clarification.hit).toBe(2);
    globalThis.expect(snapshot.clarification.rate).toBe(0.4);
    globalThis.expect(snapshot['human-confirm'].rate).toBeCloseTo(1 / 3, 4);
    globalThis.expect(snapshot.trace.rate).toBe(0.95);
    globalThis.expect(snapshot.replay.rate).toBe(0.3);

    const text = metrics.render();
    globalThis.expect(text).toContain('family_collaboration_clarify_rate 0.4');
    globalThis.expect(text).toContain('family_collaboration_trace_coverage 0.95');
  });

  it('D6: 告警契约（4 条 alert 引用 4 项协同指标）', () => {
    const alerts = [
      ['CollaborationClarifyRateHigh', 'family_collaboration_clarify_rate'],
      ['CollaborationHumanConfirmMissing', 'family_collaboration_human_confirm_rate'],
      ['CollaborationTraceCoverageLow', 'family_collaboration_trace_coverage'],
      ['CollaborationReplayCoverageLow', 'family_collaboration_replay_coverage'],
    ];
    for (const [alert, metric] of alerts) {
      globalThis.expect(RULES.includes(`alert: ${alert}`)).toBe(true);
      globalThis.expect(RULES.includes(metric)).toBe(true);
    }
    globalThis.expect(COLLABORATION.every((name) => MAP.collaboration.metrics.some((m) => m.name === name))).toBe(true);
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
