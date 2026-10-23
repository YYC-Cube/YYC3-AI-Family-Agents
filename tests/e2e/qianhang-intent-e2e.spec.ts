// @ts-nocheck
/**
 * 千行意图端到端（qianhang-intent-e2e）—— P1 真实链路（v2.11.0）。
 *
 * 链路：用户话术 → 千行意图分类（self-judge）→ 路由家人 → 天枢 CAGEERF 分解 → 伯乐成就呈现。
 * 覆盖 4 步：
 *   E1 上下文写入（对话轮次可回溯）
 *   E2 意图识别（intent / confidence / judgment / routeTo）
 *   E3 任务分解（7 阶段、owner 绑定、依赖链、traceId 贯穿）
 *   E4 交付呈现（成就面板判定）
 *
 * 运行：tsc 编译 + node（零依赖 harness）。
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

import { IntentGatewayService } from '@members/business-layer/member-qianhang/core/intent-gateway.service.js';
import { IntentClassifierService } from '@members/business-layer/member-qianhang/core/intent-classifier.service.js';
import { ContextManagerService } from '@members/business-layer/member-qianhang/core/context-manager.service.js';
import { CAGEERF_STAGES, TaskDecomposer } from '../../architecture-kernel/02-云枢核心引擎/cloud-pivot-orchestrator/task-decomposer.js';
import { HEART_TO_HEART, createAchievementPanel } from '@members/business-layer/member-bole/emotion/achievement-panel.js';

const TEXT = '帮我分析这个月的家庭开销数据';
const TRACE = 'trace-qianhang-e2e';

describe('千行意图端到端链路（话术 → 意图 → 编排 → 呈现）', () => {
  it('E1: 用户话术输入（上下文写入可回溯）', async () => {
    const context = new ContextManagerService();
    const gateway = new IntentGatewayService(new IntentClassifierService(), context);
    await gateway.handle({ text: TEXT, sessionId: 'sess-e2e', traceId: TRACE });

    const turns = context.turns('sess-e2e');
    expect(turns).toHaveLength(1);
    expect(turns[0].role).toBe('user');
    expect(turns[0].text).toBe(TEXT);
  });

  it('E2: 意图识别（intent / confidence / judgment / routeTo）', async () => {
    const gateway = new IntentGatewayService();
    const result = await gateway.handle({ text: TEXT, sessionId: 'sess-e2e', traceId: TRACE });

    expect(result.intent).toBe('analysis');
    expect(result.routeTo).toBe('010301-02'); // 语枢·万物
    expect(result.confidence >= 0.6).toBe(true);
    expect(result.judgment.escalation).toBe('none');
    expect(result.latencyMs >= 0).toBe(true);
    expect(result.judgment.agent).toBe('010301-01');
  });

  it('E3: 天枢 CAGEERF 分解（7 阶段 / owner / 依赖链 / traceId）', () => {
    const plan = new TaskDecomposer().decompose({
      id: 'intent-e2e-1',
      traceId: TRACE,
      utterance: TEXT,
      confidence: 0.9,
    });

    expect(plan.traceId).toBe(TRACE);
    expect(plan.steps).toHaveLength(7);
    expect(plan.steps.map((s) => s.stage).join(',')).toBe(CAGEERF_STAGES.join(','));
    expect(plan.steps.every((s) => s.owner !== '待编排' && /^010301-\d{2}$/.test(s.owner))).toBe(true);
    expect(plan.steps[0].dependsOn === undefined).toBe(true);
    expect(plan.steps[1].dependsOn[0]).toBe(plan.steps[0].id);
    expect(plan.steps[6].dependsOn[0]).toBe(plan.steps[5].id);
    expect(plan.steps[0].goal).toContain(TEXT);
    expect(plan.steps[6].owner).toBe('010301-04'); // 伯乐交付
  });

  it('E4: 伯乐呈现（成就面板：100 解锁 / 99 未解锁）', () => {
    const unlocked = createAchievementPanel([HEART_TO_HEART], { interactions: 100 });
    expect(unlocked[0].unlocked).toBe(true);
    expect(unlocked[0].id).toBe('member-bole.heart-to-heart');

    const locked = createAchievementPanel([HEART_TO_HEART], { interactions: 99 });
    expect(locked[0].unlocked).toBe(false);
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
  console.log(`\n结果：${passed} 通过 / ${failures.length} 失败 / ${queue.length - passed - failures.length} 跳过 / 共 ${queue.length} 例`);
  if (failures.length > 0) process.exit(1);
})();
