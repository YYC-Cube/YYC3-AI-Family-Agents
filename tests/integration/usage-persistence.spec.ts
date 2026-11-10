// @ts-nocheck
/**
 * 计量持久化测试（usage-persistence）—— M41 · 跨进程累计口径。
 *
 * 验收：
 *   U1 往返：恢复构造器注入快照 → 累计继续（totals/buckets 逐项相等）
 *   U2 快照读写容错：缺失/坏 JSON/schema 不符 → load undefined；原子写无 .tmp 残留
 *   U3 family-server 种子：usagePersist 指向既有快照 → /metrics 渲染含种子值 + 句柄基线
 *   U4 stop 落盘：start → stop → 快照文件生成（schema/updatedAt/totals）
 *   U5 缺省不启用：无 usagePersist → 零持久化行为（句柄照常、无文件触碰）
 *
 * 运行：tsc 编译 + node（零依赖 harness，范式同 family-server-assembly）。
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
      if (!String(actual).includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${String(actual).slice(0, 300)}`);
    },
    toBeFalsy: () => {
      if (actual) throw new Error(`期望假值，实际 ${JSON.stringify(actual)}`);
    },
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`期望长度 ${n}，实际 ${actual.length}`);
    },
  });
}

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LlmUsageCounter } from '../../family-agents/shared-core/llm-adapter/skill-step-executor.js';
import {
  loadUsageSnapshot,
  saveUsageSnapshot,
  startFamilyServer,
} from '../../family-agents/family-server.entry.js';

const ENTRIES = [
  { id: 'qianhang.intent-detection', name: '意图识别', description: 'd', scope: 'dedicated', owner: '02', version: '1.0.0' },
];
const TOOLS = [{ name: 'qianhang__intent_detection', description: 'd', inputSchema: {} }];
const SERVER_INFO = { name: 'yyc3-family', version: 'test' };

describe('计量持久化（M41 · 跨进程累计口径）', () => {
  it('U1 往返：恢复构造器注入快照 → 累计继续（totals/buckets 相等）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-usage-u1-'));
    const file = path.join(dir, 'metrics-usage.json');
    const a = new LlmUsageCounter();
    a.record({ promptTokens: 100, completionTokens: 50 }, { skillId: 'skill-a', scenario: 'llm-assisted' });
    a.record({ promptTokens: 10, completionTokens: 5 }, { skillId: 'skill-b', scenario: 'llm-assisted@investor' });
    saveUsageSnapshot(file, a.snapshot());
    // 新进程（新计数器）从快照恢复 → 累计继续
    const b = new LlmUsageCounter(loadUsageSnapshot(file));
    b.record({ promptTokens: 7, completionTokens: 3 }, { skillId: 'skill-a', scenario: 'llm-assisted' });
    expect(b.snapshot().totalTokens).toBe(175); // 150 + 15 + 10
    const restored = b.snapshot().buckets.find((x) => x.skillId === 'skill-a');
    expect(restored.totalTokens).toBe(160); // 150 + 10
    expect(fs.existsSync(file)).toBeTruthy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('U2 快照读写容错：缺失/坏 JSON/schema 不符 → undefined；原子写无 .tmp 残留', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-usage-u2-'));
    expect(loadUsageSnapshot(path.join(dir, 'missing.json'))).toBe(undefined);
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, '{not json');
    expect(loadUsageSnapshot(bad)).toBe(undefined);
    const wrongSchema = path.join(dir, 'wrong.json');
    fs.writeFileSync(wrongSchema, JSON.stringify({ schema: 'other/v9' }));
    expect(loadUsageSnapshot(wrongSchema)).toBe(undefined);
    const file = path.join(dir, 'snap.json');
    saveUsageSnapshot(file, new LlmUsageCounter().snapshot());
    expect(fs.existsSync(file)).toBeTruthy();
    expect(fs.readdirSync(dir).some((f) => f.endsWith('.tmp'))).toBeFalsy(); // 原子写无残留
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('U3 family-server 种子：既有快照 → /metrics 渲染含种子值 + 句柄基线', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-usage-u3-'));
    const file = path.join(dir, 'metrics-usage.json');
    const seed = new LlmUsageCounter();
    seed.record({ promptTokens: 300, completionTokens: 100 }, { skillId: 'qianhang.intent-detection', scenario: 'llm-assisted' });
    saveUsageSnapshot(file, seed.snapshot());
    const server = await startFamilyServer({
      serverInfo: SERVER_INFO,
      tools: TOOLS,
      manifestEntries: ENTRIES,
      usagePersist: { file, flushEvery: 1 },
    });
    expect(server.llmUsage.snapshot().totalTokens).toBe(400); // 启动恢复基线
    const text = server.metrics.render();
    expect(text).toContain('family_llm_usage_tokens_total{agent_id="unknown",scenario="llm-assisted",skill_id="qianhang.intent-detection"} 400');
    expect(text).toContain('family_llm_usage_calls_total{agent_id="unknown",scenario="llm-assisted",skill_id="qianhang.intent-detection"} 1');
    await server.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('U4 stop 落盘：start → stop → 快照文件生成（schema/totals）', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-usage-u4-'));
    const file = path.join(dir, 'metrics-usage.json');
    const server = await startFamilyServer({
      serverInfo: SERVER_INFO,
      tools: TOOLS,
      manifestEntries: ENTRIES,
      usagePersist: { file, flushEvery: 1 },
    });
    await server.stop();
    const snap = loadUsageSnapshot(file);
    expect(snap).toBeTruthy();
    expect(snap.schema).toBe('yyc3.usage-snapshot/v1');
    expect(typeof snap.updatedAt).toBe('string');
    expect(snap.totals.calls).toBe(0); // 未发生调用：如实零基线
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('U5 缺省不启用：无 usagePersist → 零持久化行为', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-usage-u5-'));
    const server = await startFamilyServer({
      serverInfo: SERVER_INFO,
      tools: TOOLS,
      manifestEntries: ENTRIES,
    });
    expect(server.llmUsage).toBe(undefined); // 无持久化配置且无 provider 臂 → 计数器不建
    await server.stop();
    expect(fs.existsSync(path.join(dir, 'metrics-usage.json'))).toBeFalsy();
    fs.rmSync(dir, { recursive: true, force: true });
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
