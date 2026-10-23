// @ts-nocheck
/**
 * 外部 Worker 实答 UAT（external-worker-uat）—— P2-T3。
 * 真实外部端点抽检：card 发现 → card 形态 → 任务委托（JSON-RPC · A2A 1.0 语义）。
 * 三闸（EXT_WORKER=1 + EXT_WORKER_CONFIRM + 端点存在）由 scripts/run-external-uats.mjs 保证；
 * 本 spec 只在门控放行后运行（打真实端点，不进 regression SPECS）。
 * 端点来源：EXT_WORKER_ENDPOINT（runner 从 presets/external-worker/*.worker.yaml 注入或环境直设）。
 */

const ENDPOINT = process.env.EXT_WORKER_ENDPOINT ?? '';

/**
 * 端点安全闸：仅放行显式 http(s) URL（值由三闸门控的操作员经环境注入；
 * 拒绝其余 scheme，收窄 SSRF 面）。放行后返回去尾斜杠的基址。
 */
function safeEndpointBase(): string {
  const parsed = new URL(ENDPOINT);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`EXT_WORKER_ENDPOINT 仅允许 http(s)（实际 ${parsed.protocol}）`);
  }
  return ENDPOINT.replace(/\/+$/, '');
}

function cardUrl(): string {
  return `${safeEndpointBase()}/.well-known/agent-card.json`;
}

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
    toBeFalsy: () => {
      if (actual) throw new Error(`期望假值，实际 ${JSON.stringify(actual)}`);
    },
  });
}

describe('外部 Worker 实答 UAT（P2-T3 · 真实端点）', () => {
  it('card 发现：GET /.well-known/agent-card.json 可达且为合法 JSON', async () => {
    if (!ENDPOINT) throw new Error('EXT_WORKER_ENDPOINT 未注入（runner 门控缺陷）');
    const res = await fetch(cardUrl(), { signal: AbortSignal.timeout(10_000) });
    globalThis.expect(res.ok).toBeTruthy();
    const card = await res.json();
    globalThis.expect(typeof card.agentCard?.name === 'string').toBeTruthy();
  });

  it('card 形态：skills 非空且含 yyc3 命名空间锚点（A2A 卡契约）', async () => {
    const res = await fetch(cardUrl(), { signal: AbortSignal.timeout(10_000) });
    const card = (await res.json()).agentCard;
    globalThis.expect(Array.isArray(card.skills) && card.skills.length > 0).toBeTruthy();
    globalThis.expect(typeof card.url === 'string' && card.url.startsWith('http')).toBeTruthy();
    const caps = card.skills.map((s) => s.id ?? '');
    globalThis.expect(caps.every((id) => /^[a-z0-9.-]+$/.test(id))).toBeTruthy();
  });

  it('任务委托：JSON-RPC tasks/send 可达并归一结果（taskId + state）', async () => {
    const res = await fetch(safeEndpointBase(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'yyc3-uat-1',
        method: 'tasks/send',
        params: { skillId: 'shared.self-judge', input: { probe: true } },
      }),
      signal: AbortSignal.timeout(Number(process.env.EXT_WORKER_TIMEOUT_MS ?? 15_000)),
    });
    globalThis.expect(res.ok).toBeTruthy();
    const body = await res.json();
    const result = body.result ?? body;
    globalThis.expect(typeof result.taskId === 'string' || typeof result.id === 'string').toBeTruthy();
    globalThis.expect(['submitted', 'working', 'completed', 'done'].includes(String(result.state ?? result.status ?? ''))).toBeTruthy();
  });
});

(async () => {
  if (!ENDPOINT) {
    console.log('结果：0 通过 / 0 失败 / 3 跳过 / 共 3 例（EXT_WORKER_ENDPOINT 未注入，门控跳过）');
    return;
  }
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
