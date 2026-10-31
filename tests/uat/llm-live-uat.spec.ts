// @ts-nocheck
/**
 * LLM 实答 UAT（llm-live-uat）—— 身份与意图抽检（本地门控，默认跳过）。
 *
 * 与 llm-provider.spec（本地桩 + 假密钥）互补：本规格打真实开放平台，
 * 验证「协议适配 → 鉴权 → 真实模型作答」全链路，属验收（UAT）而非 CI 门禁。
 *
 * 门控（三重，缺一即整体跳过，exit 0）：
 *   UAT_LLM=1                        显式 opting-in（防误触生产配额）
 *   <UAT_LLM_API_KEY_ENV> 存在       默认 ZHIPU_API_KEY（禁止硬编码密钥）
 *   UAT_LLM_CONFIRM=我知晓真实计费   防呆确认串（占位防误跑）
 *
 * 配置（均可选）：
 *   UAT_LLM_PROVIDER   zhipu（默认）| openai
 *   UAT_LLM_BASE_URL   覆盖端点（如 z.ai 编码计划 Key 走 https://api.z.ai/api/paas/v4）
 *   UAT_LLM_MODEL      覆盖模型（默认 glm-4-flash / gpt-4o-mini）
 *   UAT_LLM_API_KEY_ENV 覆盖密钥变量名
 *   UAT_LLM_ALLOW_HTTP 1 = 显式豁免 http 端点（仅限部署侧私有本地网关 · E0a；
 *                      缺省拒绝 http，公网端点必须 https）
 *
 * 用例（共 5）：
 *   U1 身份自报（真实作答含身份锚「千行」+ usage 计量真实）
 *   U2–U5 意图实答 ×4（LLM 分类 = 预期标签；同时输出规则主选对照，仅记录不断言）
 *
 * 安全：密钥仅从环境变量读取；不打印、不落盘、不进错误消息（ProviderError 已保证不回显）。
 * 运行：pnpm uat:llm（等价 node scripts/run-uat-llm.mjs）。
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
  });
}

import { ZhiPuProvider } from '@shared/llm-adapter/zhipu-provider.js';
import { OpenAiProvider } from '@shared/llm-adapter/openai-provider.js';
import { IntentClassifierService } from '@members/business-layer/member-qianhang/core/intent-classifier.service.js';

// ---------- 门控与配置 ----------

const GATED = process.env.UAT_LLM === '1' && process.env.UAT_LLM_CONFIRM === '我知晓真实计费';
const PROVIDER = process.env.UAT_LLM_PROVIDER === 'openai' ? 'openai' : 'zhipu';
const API_KEY_ENV = process.env.UAT_LLM_API_KEY_ENV ?? (PROVIDER === 'openai' ? 'OPENAI_API_KEY' : 'ZHIPU_API_KEY');
const MODEL = process.env.UAT_LLM_MODEL ?? (PROVIDER === 'openai' ? 'gpt-4o-mini' : 'glm-4-flash');
const KEY_PRESENT = Boolean(process.env[API_KEY_ENV]?.trim());
const LIVE = GATED && KEY_PRESENT;

function envLine(name) {
  const v = process.env[name];
  return `${name}=${v === undefined ? '（未设置）' : v === '' ? '（空串）' : `（已设置，长度 ${v.trim().length}）`}`;
}

if (!LIVE) {
  console.log('— LLM 实答 UAT 门控未满足，整体跳过（诊断如下，均为非敏感值）—');
  console.log(`  UAT_LLM=${process.env.UAT_LLM ?? '（未设置）'}（需为 1）`);
  console.log(`  UAT_LLM_CONFIRM=${process.env.UAT_LLM_CONFIRM ?? '（未设置）'}（需为：我知晓真实计费）`);
  console.log(`  ${envLine('UAT_LLM_PROVIDER')}  ${envLine('UAT_LLM_BASE_URL')}  ${envLine('UAT_LLM_MODEL')}`);
  console.log(`  ${envLine(API_KEY_ENV)}${KEY_PRESENT ? '' : '  ← 缺密钥'}`);
  console.log('  就绪后运行：UAT_LLM=1 UAT_LLM_CONFIRM=我知晓真实计费 pnpm uat:llm');
}

/** 构造真实 Provider（未门控时不应被调用）。 */
function makeProvider() {
  const opts = { timeoutMs: 30_000, maxRetries: 1, retryBaseMs: 500 };
  let base = process.env.UAT_LLM_BASE_URL;
  if (base) {
    // 跨文件污点收窄：外部覆盖的 base 仅放行 https；本地/内网网关（E0a · 部署侧
    // 显式投喂的私有端点）需另加 UAT_LLM_ALLOW_HTTP=1 显式豁免——缺省拒绝 http
    const parsed = new URL(base);
    const allowHttp = process.env.UAT_LLM_ALLOW_HTTP === '1';
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && allowHttp)) {
      throw new Error(`UAT_LLM_BASE_URL 仅允许 https（http 需 UAT_LLM_ALLOW_HTTP=1 显式豁免；实际 ${parsed.protocol}）`);
    }
  } else {
    base = undefined;
  }
  if (PROVIDER === 'openai') return new OpenAiProvider(API_KEY_ENV, base ?? 'https://api.openai.com/v1', opts);
  return new ZhiPuProvider(API_KEY_ENV, base ?? 'https://open.bigmodel.cn/api/paas/v4', opts);
}

/** 真实补全。 */
async function complete(system, user, maxTokens) {
  const out = await makeProvider().complete({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0,
    maxTokens,
  });
  console.log(`      实答[${MODEL}]：${out.text.replace(/\s+/g, ' ').slice(0, 120)}`);
  return out;
}

const INTENT_LABELS = ['analysis', 'prediction', 'recommendation', 'creation', 'orchestration', 'chat'];
const INTENT_SYSTEM = `你是家庭智能体家族的意图分类器。从以下标签中选出一个最匹配用户话语的意图：${INTENT_LABELS.join('、')}。只输出 JSON：{"intent":"标签"}，不要输出其它内容。`;

/** 实答意图分类（容错解析：剥代码围栏后取 intent 字段）。 */
async function classifyByLlm(text) {
  const out = await complete(INTENT_SYSTEM, text, 64);
  const raw = out.text.replace(/```[a-z]*|```/gi, '');
  const m = raw.match(/"intent"\s*:\s*"([a-zA-Z]+)"/);
  if (!m) throw new Error(`实答不含 intent 字段：${out.text.slice(0, 120)}`);
  const label = m[1].toLowerCase();
  if (!INTENT_LABELS.includes(label)) throw new Error(`实答标签越界（不在六意图内）：${label}`);
  return label;
}

/** 规则主选对照（仅记录，不断言——规则分类已由 e2e/单测覆盖）。 */
async function rulePrimary(text) {
  const rule = await new IntentClassifierService().classify({ text, ctx: { traceId: 'trace-llm-live-uat' } });
  return rule.primary.label;
}

// ---------- 用例 ----------

describe('LLM 实答 UAT（身份与意图抽检，真实开放平台）', () => {
  it('U1: 身份自报（真实作答含「千行」锚 + usage 计量非零）', async () => {
    const out = await complete(
      '你是言启·千行，YYC³ 家人 Agent 家族的意图调度中枢，负责理解用户并路由家人。',
      '你是谁？请用一句话自报身份。',
      128,
    );
    expect(out.finishReason).toBe('stop');
    expect(out.text).toContain('千行');
    expect(out.usage.promptTokens > 0).toBe(true);
    expect(out.usage.completionTokens > 0).toBe(true);
  });

  it('U2: 意图实答——分析（开销数据 → analysis）', async () => {
    const text = '帮我分析这个月的家庭开销数据';
    const label = await classifyByLlm(text);
    console.log(`      对照：规则主选=${await rulePrimary(text)} 实答=${label}`);
    expect(label).toBe('analysis');
  });

  it('U3: 意图实答——编排（整理待办 → orchestration）', async () => {
    const text = '帮我把这些事情整理成待办清单，明天提醒我';
    const label = await classifyByLlm(text);
    console.log(`      对照：规则主选=${await rulePrimary(text)} 实答=${label}`);
    expect(label).toBe('orchestration');
  });

  it('U4: 意图实答——预测（支出趋势 → prediction）', async () => {
    const text = '预测一下下个季度我们家的支出趋势';
    const label = await classifyByLlm(text);
    console.log(`      对照：规则主选=${await rulePrimary(text)} 实答=${label}`);
    expect(label).toBe('prediction');
  });

  it('U5: 意图实答——闲聊（寒暄 → chat）', async () => {
    const text = '你好呀，今天想和你聊聊家常';
    const label = await classifyByLlm(text);
    console.log(`      对照：规则主选=${await rulePrimary(text)} 实答=${label}`);
    expect(label).toBe('chat');
  });
});

(async () => {
  const queue = globalThis.__queue ?? [];
  let passed = 0;
  const failures = [];
  for (const t of queue) {
    if (!LIVE) break; // 门控未满足：整组跳过，不打真实接口
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
