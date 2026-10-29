// @ts-nocheck
/**
 * 九层底座测试（nine-layer）—— P9-a（M29）· A 类骨架首批接线。
 *
 * 验收：
 *   N1 静态清单完备：withDefaults 9 层 · describeAll 与 §4.2 LAYER_DESCRIPTORS 全同
 *      · L1 无承载家人、其余有 · list 按 L1..L9 序
 *   N2 探针注入：healthAll 反映注入态（degraded / ok 混合）· 无探针层恒 ok
 *   N3 单层异常隔离：探针抛错 → 该层 down 带 detail · 其余层不受影响
 *   N4 注册守卫：重复注册抛错 · get 语义
 *   N5 态势对接：reportLayerHealth → statusCenter 9 条 `layer-*` 服务态
 *      · overall 最坏态推导（degraded → 恢复 ok）
 *
 * 运行：tsc 编译 + node（零依赖 harness，范式同 family-ops）。
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

import {
  LAYER_DESCRIPTORS,
  NineLayerRegistry,
} from '../../architecture-kernel/01-九层架构分层底座/index.js';
import { StatusCenter } from '../../architecture-kernel/02-云枢核心引擎/global-status-center/status-center.js';
import { InMemorySkillStore } from '../../architecture-kernel/05-持续学习引擎/learning-loop.js';
import { createRuntimeAssembly } from '../../architecture-kernel/08-系统装配/runtime-assembly.js';

describe('九层底座（P9-a · M29 · 注册中心 + 态势对接）', () => {
  it('N1 静态清单完备：9 层自描述与 §4.2 清单全同，list 按 L1..L9 序', () => {
    const registry = NineLayerRegistry.withDefaults();
    expect(registry.list()).toHaveLength(9);
    const desc = registry.describeAll();
    expect(desc).toHaveLength(9);
    expect(desc.map((d) => d.id).join('')).toBe('L1L2L3L4L5L6L7L8L9');
    for (const d of desc) {
      const row = LAYER_DESCRIPTORS[d.id];
      expect(d.theme).toBe(row.theme);
      expect(d.capability).toBe(row.capability);
      expect(d.kind).toBe(row.kind);
      if (d.id === 'L1') expect(d.member).toBe(undefined); // 基础底座无承载家人
      else expect(d.member).toBeTruthy();
    }
  });

  it('N2 探针注入：healthAll 反映注入态，无探针层恒 ok', async () => {
    const registry = NineLayerRegistry.withDefaults({
      L5: async () => ({ status: 'degraded', detail: '意图延迟 260ms 超阈' }),
      L8: () => ({ status: 'ok' }),
    });
    const report = await registry.healthAll();
    expect(report).toHaveLength(9);
    const byId = new Map(report.map((r) => [r.id, r]));
    expect(byId.get('L5').status).toBe('degraded');
    expect(byId.get('L5').detail).toContain('260ms');
    expect(byId.get('L8').status).toBe('ok');
    expect(byId.get('L1').status).toBe('ok'); // 无探针恒 ok
  });

  it('N3 单层异常隔离：探针抛错 → 该层 down 带 detail，其余不受影响', async () => {
    const registry = NineLayerRegistry.withDefaults({
      L9: () => {
        throw new Error('编排器连接失败');
      },
    });
    const report = await registry.healthAll();
    const byId = new Map(report.map((r) => [r.id, r]));
    expect(byId.get('L9').status).toBe('down');
    expect(byId.get('L9').detail).toContain('编排器连接失败');
    expect(byId.get('L4').status).toBe('ok');
    expect(byId.get('L6').status).toBe('ok');
  });

  it('N4 注册守卫：重复注册抛错；get 语义', () => {
    const registry = NineLayerRegistry.withDefaults();
    let threw = '';
    try {
      registry.register(registry.get('L1'));
    } catch (e) {
      threw = e.message;
    }
    expect(threw).toContain('层级重复注册');
    expect(registry.get('L5').id).toBe('L5');
    expect(registry.get('L0')).toBe(undefined); // 非法层级无实例
  });

  it('N5 态势对接：reportLayerHealth → statusCenter 9 条 layer 服务态 + overall 最坏态推导', async () => {
    const statusCenter = new StatusCenter();
    const a = createRuntimeAssembly({
      store: new InMemorySkillStore(),
      nineLayer: {
        statusCenter,
        probes: { L8: () => ({ status: 'degraded', detail: '熔断 open' }) },
      },
    });
    expect(a.layers).toBeTruthy();
    expect(a.reportLayerHealth).toBeTruthy();
    const report = await a.reportLayerHealth();
    expect(report).toHaveLength(9);
    const snap = statusCenter.snapshot();
    const layerServices = snap.services.filter((s) => s.name.startsWith('layer-'));
    expect(layerServices).toHaveLength(9);
    expect(layerServices.find((s) => s.name === 'layer-L8').status).toBe('degraded');
    expect(snap.overall).toBe('degraded'); // L8 degraded → overall 最坏态 degraded
    // 恢复场景：新装配（无探针 = 全 ok）重复上报 → 同名去重覆盖，overall 回 ok
    const b = createRuntimeAssembly({ store: new InMemorySkillStore(), nineLayer: { statusCenter } });
    await b.reportLayerHealth();
    const snap2 = statusCenter.snapshot();
    expect(snap2.services.filter((s) => s.name.startsWith('layer-'))).toHaveLength(9);
    expect(snap2.overall).toBe('ok');
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
