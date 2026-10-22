// @ts-nocheck
/**
 * Phase D 治/愈转实测试 —— 故障侦测 / 降级熔断 / 一致性修复 / 合规审计 + 记忆全链路（§5.4 / §5.5）。
 *
 * 覆盖目标（对应《架构设计.md》§6.4 Phase D 验收「策略即代码覆盖核心链路；记忆 RTO≤5min/RPO=0」）：
 *   G1 故障侦测：去抖窗口 + 严重度按超出比率映射 + 信号回落清零
 *   G2 熔断状态机：closed → open →（冷却）half-open → closed/open 全迁移
 *   G3 一致性修复：快照增量修复 + RTO ≤ 300s 记账 + 不可修复项升级人工
 *   G4 合规审计：FNV-1a 链式哈希，篡改可检测（verify 断链）
 *   G5 记忆全链路：commit → retrieve → checkConsistency → forget（知）↔ ConsistencyRepair（愈）联动
 *
 * 运行：tsc 编译 + node（零依赖 harness），后续迁 vitest。
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
    toBeTruthy: () => {
      if (!actual) throw new Error(`期望真值，实际 ${JSON.stringify(actual)}`);
    },
    toBeUndefined: () => {
      if (actual !== undefined) throw new Error(`期望 undefined，实际 ${JSON.stringify(actual)}`);
    },
    toBeGreaterThanOrEqual: (exp) => {
      if (!(actual >= exp)) throw new Error(`期望 >= ${exp}，实际 ${actual}`);
    },
    toBeLessThanOrEqual: (exp) => {
      if (!(actual <= exp)) throw new Error(`期望 <= ${exp}，实际 ${actual}`);
    },
    toContain: (exp) => {
      if (!actual.includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${JSON.stringify(actual)}`);
    },
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`期望长度 ${n}，实际 ${actual.length}`);
    },
  });
}

import { ComplianceAudit } from '../../02-智能协同架构内核/06-治理中心/compliance-audit/compliance-audit.js';
import { ConsistencyRepair } from '../../02-智能协同架构内核/07-自愈中心/consistency-repair/consistency-repair.js';
import { DegradationController } from '../../02-智能协同架构内核/07-自愈中心/degradation-controller/degradation-controller.js';
import { FaultDetector } from '../../02-智能协同架构内核/07-自愈中心/fault-detector/fault-detector.js';
import { RTO_RPO_TARGETS } from '../../02-智能协同架构内核/07-自愈中心/types.js';
import { ConsistencyChecker } from '../../03-家人Agent实现集/shared-core/memory-framework/memory-orchestrator/consistency-checker.js';
import { MemoryOrchestratorImpl } from '../../03-家人Agent实现集/shared-core/memory-framework/memory-orchestrator/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const busSignal = (observed, threshold = 100) => ({ layer: 'bus', type: 'backlog', observed, threshold });

describe('Phase D 治/愈 · 故障侦测 / 熔断 / 一致性修复 / 审计链 / 记忆全链路', () => {
  it('G1 故障侦测：去抖防毛刺 + 严重度按比率映射 + 回落清零', () => {
    const fd = new FaultDetector({ debounceCount: 2, windowMs: 60_000 });
    // 首次超阈：仅登记不触发（单次毛刺不自愈）
    expect(fd.detect(busSignal(150))).toBeUndefined();
    // 窗口内第二次 → 触发；ratio 1.5 → high
    const f = fd.detect(busSignal(150));
    expect(f).toBeTruthy();
    expect(f.severity).toBe('high');
    expect(f.id).toContain('fault-bus-backlog');
    expect(f.detail).toContain('第 2 次超阈');

    // debounce=1：首次即报；ratio ≥ 2 → critical
    const fd1 = new FaultDetector({ debounceCount: 1 });
    const fc = fd1.detect({ layer: 'memory', type: 'pollution', observed: 300, threshold: 120 });
    expect(fc).toBeTruthy();
    expect(fc.severity).toBe('critical');

    // ratio 1.3 → med；ratio 1.1 → low
    expect(fd1.detect({ layer: 'bus', type: 'lag', observed: 130, threshold: 100 }).severity).toBe('med');
    expect(fd1.detect({ layer: 'bus', type: 'lag2', observed: 110, threshold: 100 }).severity).toBe('low');

    // 信号回落清零：后续单次超阈重新计数
    const fd2 = new FaultDetector({ debounceCount: 2, windowMs: 60_000 });
    expect(fd2.detect(busSignal(150))).toBeUndefined();
    expect(fd2.detect(busSignal(50))).toBeUndefined();
    expect(fd2.detect(busSignal(150))).toBeUndefined();
    expect(fd2.detect(busSignal(150))).toBeTruthy();
  });

  it('G2 熔断状态机全迁移：closed→open→half-open→closed / half-open 失败→open', async () => {
    const dc = new DegradationController({ failureThreshold: 2, cooldownMs: 10 });
    const fault = { id: 'f', layer: 'model-service', type: 'llm-timeout', severity: 'high', detail: '', detectedAt: 1 };

    // closed：普通降级（非 bus 层 → degrade）
    expect(dc.circuitState).toBe('closed');
    expect(dc.degrade(fault).detail).toContain('degrade');

    // 连续失败达阈值 → open：全量熔断
    dc.recordFailure();
    dc.recordFailure();
    expect(dc.circuitState).toBe('open');
    expect(dc.degrade(fault).detail).toContain('circuit-break');

    // 冷却期满 → half-open：放行试探性降级
    await sleep(15);
    const probe = dc.degrade(fault);
    expect(dc.circuitState).toBe('half-open');
    expect(probe.detail).toContain('half-open');

    // 试探成功 → closed；失败计数清零
    dc.recordSuccess();
    expect(dc.circuitState).toBe('closed');
    expect(dc.degrade(fault).detail).toContain('degrade');

    // half-open 试探失败 → 重新 open
    dc.recordFailure();
    dc.recordFailure();
    await sleep(15);
    dc.degrade(fault); // 进入 half-open
    dc.recordFailure();
    expect(dc.circuitState).toBe('open');

    // bus 层 closed 状态 → 限流（throttle）
    const dcBus = new DegradationController({});
    expect(
      dcBus.degrade({ id: 'b', layer: 'bus', type: 'backlog', severity: 'med', detail: '', detectedAt: 1 }).detail,
    ).toContain('throttle');
  });

  it('G3 一致性修复：快照增量修复 RTO ≤ 300s；不可修复项升级人工', () => {
    const target = RTO_RPO_TARGETS.memory;
    expect(target.rtoSeconds).toBe(300);
    expect(target.rpoSeconds).toBe(0);

    const issue = (repairable, id = 'm1') => ({
      kind: 'duplicate',
      layer: 'semantic',
      id,
      detail: 'd',
      severity: 'med',
      repairable,
    });
    const report = (issues) => ({ scope: {}, ok: false, checkedAt: 123, issues, layers: ['semantic', 'episodic'] });

    // 校验通过 → healed，零耗时
    const okOut = new ConsistencyRepair().repair({ scope: {}, ok: true, checkedAt: 1, issues: [], layers: [] });
    expect(okOut.status).toBe('healed');
    expect(okOut.rpoSeconds).toBe(0);

    // 全部可修复且执行成功 → healed + RTO 记账达标（RPO = 0）
    const healed = new ConsistencyRepair({ repairIssue: () => true }).repair(report([issue(true), issue(true)]));
    expect(healed.status).toBe('healed');
    expect(healed.contractMet).toBe(true);
    expect(healed.rtoSeconds).toBeLessThanOrEqual(target.rtoSeconds);
    expect(healed.rpoSeconds).toBe(0);
    expect(healed.detail).toContain('2/2');

    // 部分失败 → degraded（第二条 issue id 不同，执行器只认领 m1）
    expect(
      new ConsistencyRepair({ repairIssue: (i) => i.id === 'm1' }).repair(
        report([issue(true, 'm1'), issue(true, 'm2')]),
      ).status,
    ).toBe('degraded');

    // 无修复执行器 / 存在不可修复项 → escalated 上报人工
    expect(new ConsistencyRepair().repair(report([issue(true)])).status).toBe('escalated');
    expect(new ConsistencyRepair({ repairIssue: () => true }).repair(report([issue(true), issue(false)])).status).toBe(
      'escalated',
    );
  });

  it('G4 合规审计链：链式哈希防篡改，篡改任意一条 verify 即断链', () => {
    const audit = new ComplianceAudit();
    const req = (traceId) => ({ traceId, actor: 'qianxing', action: 'tool.invoke', resource: 'web-search' });
    const dec = { decision: 'allow', policyId: 'p1', policyVersion: '1.0.0', reason: '白名单命中' };

    const r1 = audit.append(req('tr-1'), dec);
    const r2 = audit.append(req('tr-2'), dec);
    audit.append(req('tr-3'), dec);

    expect(r1.hash === 'PENDING').toBe(false);
    expect(r2.prevHash).toBe(r1.hash);
    expect(audit.list()).toHaveLength(3);
    expect(audit.verify()).toBe(true);

    // 篡改中间一条 → 重算不符 + 断链
    const list = audit.list();
    list[1].actor = 'intruder';
    expect(audit.verify()).toBe(false);
  });

  it('G5 记忆全链路：commit→retrieve→checkConsistency→forget（知）↔ 快照修复（愈）', async () => {
    const orch = new MemoryOrchestratorImpl();
    const scope = { agent: 'qianxing' };
    const ctx = {
      traceId: 'tr-m1',
      agent: 'qianxing',
      taskId: 'task-1',
      taskType: 'analysis',
      startedAt: Date.now(),
      scope,
    };

    // 写入：episodic 层（write-policy 默认评分 0.52 ≥ 0.35 → accepted）
    const ack = await orch.commit({
      layer: 'episodic',
      payload: { summary: '季度报告已完成', salience: 0.9 },
      salience: 0.9,
      provenance: { agent: 'qianxing', traceId: 'tr-m1', ts: Date.now() },
    });
    expect(ack.accepted).toBe(true);
    expect(ack.layer).toBe('episodic');

    // 检索：文本命中情景轨迹
    const bundle = await orch.retrieve({ text: '季度报告', layers: ['episodic'], scope }, ctx);
    expect(bundle.hits.length >= 1).toBe(true);
    expect(bundle.hits[0].layer).toBe('episodic');
    expect(bundle.layerStats.episodic >= 1).toBe(true);

    // 一致性：单条无重复 → ok
    const rep = await orch.checkConsistency(scope);
    expect(rep.ok).toBe(true);

    // 遗忘：显著度低于阈值（0.99）→ aged-or-faded 路径遗忘
    const fack = await orch.forget({ layers: ['episodic'], minSalience: 0.99, scope });
    expect(fack.forgotten >= 1).toBe(true);

    // 知↔愈联动：跨层重复 → ConsistencyRepair 快照修复 → healed
    const checker = new ConsistencyChecker();
    const bad = checker.check(scope, [
      { layer: 'semantic', records: [{ id: 'mem-x' }] },
      { layer: 'episodic', records: [{ id: 'mem-x' }] },
    ]);
    expect(bad.ok).toBe(false);
    expect(bad.issues[0].repairable).toBe(true);
    const repaired = new ConsistencyRepair({ repairIssue: () => true }).repair(bad);
    expect(repaired.status).toBe('healed');
    expect(repaired.layer).toBe('memory');
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
        console.log(`FAIL  ${c.name}\n      ${e && e.message}`);
      }
    }
    console.log(`\n结果：${passed} 通过 / ${failed} 失败 / 共 ${passed + failed} 例`);
    if (failed > 0) process.exit(1);
  })();
}
