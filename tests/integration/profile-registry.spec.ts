// @ts-nocheck
/**
 * 场景画像层测试（profile-registry）—— E4a（演进集 v1.2.0 解冻第一波）。
 *
 * 验收：
 *   P1 登记与查询：批量装载 / 重复注册抛错 / list 序 / get 语义
 *   P2 换档解析：画像命中换 tier+输出风格；未命中/无 id 走缺省档
 *      （`${LLM_STEP_TIER:-flagship}` 占位——env 注入可换 speed）
 *   P3 计量分口径：resolve().scenarioTag 上报 family_llm_usage_* 渲染含
 *      `llm-assisted@<profileId>`
 *   P4 域卡校验：check-profiles.mjs exit 0（8 卡 · 八家人 · tier 占位合规）
 *   P5 换档演示（卡验收）：投资人简报 → reasoning；日常运营 → speed；
 *      计量分口径各 1 例可见（family-server 句柄 profiles 可查）
 *
 * 运行：tsc 编译 + node（零依赖 harness，范式同 nine-layer）。
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
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`期望长度 ${n}，实际 ${actual.length}`);
    },
  });
}

import { execFileSync } from 'node:child_process';
import { ProfileRegistry, tierFromEnv } from '../../family-agents/shared-core/profile-registry.js';
import { FamilyMetrics } from '../../architecture-kernel/09-可观测性/family-metrics.js';

const PROFILE = (over = {}) => ({
  id: 'investor-briefing',
  domain: 'hotel-investment',
  owner: 'thinker',
  preferences: { tier: 'reasoning', outputStyle: '结构化简报' },
  promptAnchors: ['测算口径先行'],
  ...over,
});

const DAILY = PROFILE({
  id: 'intent-routing',
  domain: 'ops-daily',
  owner: 'qianhang',
  preferences: { tier: 'speed', outputStyle: '对话流' },
});

describe('场景画像层（E4a · ProfileRegistry）', () => {
  it('P1 登记与查询：批量装载 · 重复注册抛错 · list 按 id 序', () => {
    const registry = new ProfileRegistry();
    registry.loadAll([DAILY, PROFILE()]);
    expect(registry.list()).toHaveLength(2);
    expect(registry.list()[0].id).toBe('intent-routing'); // id 升序
    expect(registry.get('investor-briefing').owner).toBe('thinker');
    expect(registry.get('nope')).toBe(undefined);
    let threw = '';
    try {
      registry.register(PROFILE());
    } catch (e) {
      threw = e.message;
    }
    expect(threw).toContain('画像重复注册');
  });

  it('P2 换档解析：画像命中换 tier/风格；缺省档走 env 占位（LLM_STEP_TIER）', () => {
    const registry = new ProfileRegistry();
    registry.loadAll([PROFILE(), DAILY]);
    const brief = registry.resolve('investor-briefing');
    expect(brief.modelTier).toBe('reasoning'); // 投资人简报 → 推理档
    expect(brief.outputStyle).toBe('结构化简报');
    const daily = registry.resolve('intent-routing');
    expect(daily.modelTier).toBe('speed'); // 日常运营 → 速度档
    expect(daily.scenarioTag).toBe('llm-assisted@intent-routing');
    // 缺省档：无画像/未登记 → ${LLM_STEP_TIER:-flagship} 占位语义
    expect(tierFromEnv()).toBe('flagship');
    expect(tierFromEnv({ LLM_STEP_TIER: 'speed' })).toBe('speed');
    expect(new ProfileRegistry(tierFromEnv({ LLM_STEP_TIER: 'speed' })).resolve().modelTier).toBe('speed');
    expect(new ProfileRegistry().resolve('nope').scenarioTag).toBe('llm-assisted'); // 未登记归基础标签
  });

  it('P3 计量分口径：scenarioTag 上报 family_llm_usage_* 渲染含画像标签', () => {
    const registry = new ProfileRegistry();
    registry.loadAll([PROFILE(), DAILY]);
    const metrics = new FamilyMetrics();
    for (const id of ['investor-briefing', 'intent-routing']) {
      const resolved = registry.resolve(id);
      metrics.recordLlmUsage({ skillId: 'demo.skill', scenario: resolved.scenarioTag }, 100);
    }
    const text = metrics.render();
    expect(text).toContain('family_llm_usage_tokens_total{agent_id="unknown",scenario="llm-assisted@investor-briefing",skill_id="demo.skill"} 100');
    expect(text).toContain('family_llm_usage_tokens_total{agent_id="unknown",scenario="llm-assisted@intent-routing",skill_id="demo.skill"} 100');
    expect(text).toContain('family_llm_usage_calls_total{agent_id="unknown",scenario="llm-assisted@intent-routing",skill_id="demo.skill"} 1');
  });

  it('P4 域卡校验：check-profiles exit 0（8 卡 · 八家人全覆盖 · E1b 题源）', () => {
    try {
      execFileSync('node', ['scripts/check-profiles.mjs'], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      const detail = String((e && (e.stderr || e.stdout)) || e.message).slice(0, 300);
      throw new Error(`check-profiles 非零退出：${detail}`);
    }
  });

  it('P5 换档演示（卡验收）：双档各 1 例 + 计量分口径可见 + 服务句柄可查', async () => {
    const { startFamilyServer } = await import('../../family-agents/family-server.entry.js');
    const server = await startFamilyServer({
      serverInfo: { name: 'yyc3-family', version: 'test' },
      tools: [{ name: 't__x', description: 'x', inputSchema: {} }],
      manifestEntries: [],
      profiles: [PROFILE(), DAILY],
    });
    expect(server.profiles).toBeTruthy();
    expect(server.profiles.resolve('investor-briefing').modelTier).toBe('reasoning'); // 投资人简报 → 推理档
    expect(server.profiles.resolve('intent-routing').modelTier).toBe('speed'); // 日常运营 → 速度档
    expect(server.profiles.list()).toHaveLength(2);
    await server.stop();
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
