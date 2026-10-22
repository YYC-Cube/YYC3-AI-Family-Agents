// @ts-nocheck
/**
 * infra 集成位测试（§6.4 infra-1～4）—— v2.5.0。
 *
 * 覆盖目标：
 *   I1 总线→轨迹桥接（family-communication-bus → TrajectoryCollector；幂等去重 + 坏载荷拒收）
 *   I2 语义抽象端口注入（SemanticAbstractor 可插拔，缺省确定性实现输出与 v2.4.0 一致）
 *   I3 FileSkillStore 落盘 round-trip（持久化、重启恢复、损坏文件容错）
 *   I4 学习回滚委托自愈中心（healingRollback 钩子 + RollbackController RTO 记账与失败不谎报）
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
    toEqual: (exp) => {
      const ja = JSON.stringify(actual);
      const je = JSON.stringify(exp);
      if (ja !== je) throw new Error(`期望 ${je}，实际 ${ja}`);
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

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventBus } from '../../02-智能协同架构内核/02-云枢核心引擎/family-communication-bus/event-bus.js';
import { TrajectoryBridge } from '../../02-智能协同架构内核/02-云枢核心引擎/family-communication-bus/trajectory-bridge.js';
import { TrajectoryCollector } from '../../02-智能协同架构内核/05-持续学习引擎/experience-reflow/trajectory-collector.js';
import {
  DeterministicSemanticAbstractor,
  PatternExtractor,
} from '../../02-智能协同架构内核/05-持续学习引擎/experience-reflow/pattern-extractor.js';
import { InMemorySkillStore, LearningLoop } from '../../02-智能协同架构内核/05-持续学习引擎/learning-loop.js';
import { FileSkillStore } from '../../02-智能协同架构内核/05-持续学习引擎/skill-consolidation/skill-store-file.js';
import { RollbackController } from '../../02-智能协同架构内核/07-自愈中心/rollback-controller/rollback-controller.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 构造总线 task.executed 事件。 */
function busEvent(traceId, seq, payload) {
  return {
    key: { traceId, agentId: payload?.agent ?? 'qianxing', seq },
    topic: 'task.executed',
    mode: 'broadcast',
    payload,
    at: 100,
  };
}

const goodPayload = {
  agent: 'qianxing',
  taskType: 'analysis',
  steps: [{ order: 1, action: 'retrieve', tool: 'memory', ok: true }],
  startedAt: 1,
  finishedAt: 9,
  completed: true,
};

/** 构造已标注轨迹（I2 用）。 */
function labeled(agent, taskType, tool, traceId, label = 'success') {
  return {
    trajectory: {
      traceId,
      agent,
      taskType,
      steps: [{ order: 1, action: 'act', tool, ok: true }],
      startedAt: 0,
      finishedAt: 1,
      completed: true,
    },
    label,
    rationale: 'test',
  };
}

describe('infra 集成位 · 总线桥接 / 抽象端口 / 技能落盘 / 回滚委托', () => {
  it('I1 总线 task.executed → 轨迹采集器；幂等去重 + 坏载荷拒收计数', async () => {
    const collector = new TrajectoryCollector();
    const bridge = new TrajectoryBridge(collector);
    const bus = new EventBus();
    bridge.attach(bus);

    await bus.publish(busEvent('tr-1', 1, goodPayload));
    expect(collector.size()).toBe(1);
    expect(bridge.stats.accepted).toBe(1);

    // 幂等键重复（同 traceId:agentId:seq）→ 总线去重，桥不再受理
    await bus.publish(busEvent('tr-1', 1, goodPayload));
    expect(collector.size()).toBe(1);
    expect(bridge.stats.accepted).toBe(1);

    // 坏载荷 → 拒收计数，不抛错、不阻塞总线
    await bus.publish(busEvent('tr-2', 2, { foo: 'bar' }));
    expect(collector.size()).toBe(1);
    expect(bridge.stats.rejected).toBe(1);

    // traceId 从幂等键注入（三环链路贯穿）
    const drained = collector.drain();
    expect(drained[0].traceId).toBe('tr-1');
    expect(drained[0].metadata.seq).toBe(1);
  });

  it('I2 SemanticAbstractor 端口注入生效；缺省确定性实现与 v2.4.0 输出一致', () => {
    const traj = [
      labeled('a', 't', 'x', 'r1'),
      labeled('a', 't', 'x', 'r2'),
    ];

    // 注入自定义抽象器（模拟 llm-adapter 结构化输出）
    const custom = new PatternExtractor(2, 0.8, {
      abstract: (i) => ({ condition: `情境[${i.agent}/${i.taskType}]`, outcome: `custom ${i.successCount}` }),
    });
    const patterns = custom.extractWith(traj, {});
    expect(patterns).toHaveLength(1);
    expect(patterns[0].condition).toBe('情境[a/t]');
    expect(patterns[0].outcome).toBe('custom 2');
    expect(patterns[0].supportingTraces).toHaveLength(2);

    // 缺省确定性抽象器：与 v2.4.0 输出逐字节一致（skillId 稳定性的前提）
    const legacy = new PatternExtractor().extract(traj);
    expect(legacy).toHaveLength(1);
    expect(legacy[0].condition).toBe('a · t');
    expect(legacy[0].outcome).toBe('任务成功率 100%（2/2 溯源轨迹）');
  });

  it('I3 FileSkillStore 落盘 round-trip：重启恢复、版本共存、损坏文件容错', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-skills-'));
    try {
      const store = new FileSkillStore(dir);
      const mk = (id, version, status) => ({
        id,
        name: `技能 ${version}`,
        version,
        description: 'd',
        when: ['w'],
        steps: ['s'],
        status,
        createdAt: 1,
        useCount: 0,
      });
      store.replaceHistory('skill-abc', [
        mk('skill-abc', '1.0.0', 'deprecated'),
        mk('skill-abc', '1.1.0', 'active'),
      ]);

      // 新实例（模拟进程重启）读回完整历史
      const reopened = new FileSkillStore(dir);
      expect(reopened.historyOf('skill-abc')).toHaveLength(2);
      expect(reopened.activeSkills()).toHaveLength(1);
      expect(reopened.activeSkills()[0].version).toBe('1.1.0');
      expect(reopened.size()).toBe(1);

      // 损坏文件容错：返回空历史而非抛错
      fs.writeFileSync(path.join(dir, 'skill-broken.json'), '{oops');
      expect(reopened.historyOf('skill-broken')).toHaveLength(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('I4 学习回滚钩子触发 + 自愈 RollbackController RTO 记账、失败不谎报', async () => {
    // 学习侧：回归必败 → 回滚 + healingRollback 钩子
    const events = [];
    const store = new InMemorySkillStore();
    const loop = new LearningLoop(store, {
      regressionCases: [{ id: 'r1', expected: 'ok' }],
      evaluate: () => 'broken',
      healingRollback: (e) => events.push(e),
    });
    for (let i = 0; i < 2; i += 1) {
      loop.ingest([
        {
          event: {
            traceId: `t-${i}`,
            agent: 'a',
            taskType: 't',
            steps: [{ order: 1, action: 'act', tool: 'x', ok: true }],
            startedAt: 0,
            finishedAt: 1,
            completed: true,
          },
          goldenPass: true,
        },
      ]);
    }
    const report = loop.runCycle();
    expect(report.rolledBack).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0].version).toBe('1.0.0');
    expect(events[0].restored).toBeUndefined();
    expect(events[0].faultId).toContain('learning-rollback-');
    // 无前置版本可恢复 → 回滚后技能库无 active（稳定性红线：失败学习不入库）
    expect(store.activeSkills()).toHaveLength(0);

    // 愈侧：SkillRollbackPort 委托 + RTO 记账（learning 契约 600s）
    const calls = [];
    const rc = new RollbackController({
      skill: { rollbackSkill: (id) => { calls.push(id); return '0.9.0'; } },
    });
    const fault = { id: 'f1', layer: 'learning', type: 'skill-regression', severity: 'high', detail: 'd', detectedAt: 1 };
    const out = rc.rollback(fault, 'skill-x');
    expect(out.status).toBe('healed');
    expect(out.contractMet).toBe(true);
    expect(out.rtoSeconds).toBeGreaterThanOrEqual(0);
    expect(out.rtoSeconds).toBeLessThanOrEqual(600);
    expect(out.detail).toContain('0.9.0');
    expect(calls).toContain('skill-x');

    // 执行器抛错 → failed + contractMet=false（绝不谎报愈合）
    const rcBad = new RollbackController({
      skill: {
        rollbackSkill: () => {
          throw new Error('git revert 冲突');
        },
      },
    });
    const outBad = rcBad.rollback(fault, 'skill-x');
    expect(outBad.status).toBe('failed');
    expect(outBad.contractMet).toBe(false);
    expect(outBad.detail).toContain('git revert 冲突');

    // 基础设施灰度回滚：InfraRollbackPort 委托（infrastructure 契约 60s）
    const infraCalls = [];
    const rcInfra = new RollbackController({ infra: { rollbackInfra: (t) => infraCalls.push(t) } });
    const outInfra = rcInfra.rollback(
      { id: 'f2', layer: 'infrastructure', type: 'node-unhealthy', severity: 'high', detail: '', detectedAt: 1 },
      'deploy/family-api',
    );
    expect(outInfra.status).toBe('healed');
    expect(outInfra.contractMet).toBe(true);
    expect(infraCalls).toContain('deploy/family-api');

    // 未装配端口 → failed
    const outNone = new RollbackController().rollback(fault, 'skill-x');
    expect(outNone.status).toBe('failed');
    expect(outNone.contractMet).toBe(false);
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
