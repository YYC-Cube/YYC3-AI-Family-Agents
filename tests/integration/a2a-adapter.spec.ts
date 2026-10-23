// @ts-nocheck
/**
 * A2A 适配层集成测试（a2a-adapter.spec）—— P2-T2。
 * 门禁映射：card 发现（well-known 映射 + 内存注册表）；任务委托
 *   （JSON-RPC 构造 + 归一 + 超时/非法响应入 DLQ 不抛出）；traceId 贯穿；DLQ 有界。
 * 边界：纯内存 stub，零网络（transport 注入 fake）。
 */

import {
  A2A_METHOD,
  CardDirectory,
  DelegateClient,
  slugOf,
  wellKnownPath,
} from '../../architecture-kernel/a2a-adapter/index.js';

const TIANSHU_CARD = {
  name: '元启·天枢 (TianShu)',
  description: 'YYC³ AI Family 总指挥 · 决策中枢',
  url: 'https://matrix.yyc3.top/family/tianshu',
  version: '1.1.0',
  skills: [{ id: 'shared.self-judge', name: '结构化自判断', description: '产出置信度' }],
};
const QIANHANG_CARD = {
  name: '语枢·千行 (QianHang)',
  description: 'YYC³ AI Family 交互执行 · 对话界面',
  url: 'https://matrix.yyc3.top/family/qianhang',
  version: '1.1.0',
  skills: [{ id: 'qianhang.nlq-to-api', name: 'NLQ 转 API', description: '自然语言转查询' }],
};

function makeDirectory() {
  const dir = new CardDirectory();
  dir.register(TIANSHU_CARD);
  dir.register(QIANHANG_CARD);
  return dir;
}

const okTransport = (respond) => ({ send: async () => respond });

// ---------- 零依赖 harness（输出汇总行供门禁解析） ----------

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

describe('A2A 适配层（P2-T2 · 纯内存 stub）', () => {
  it('card 发现：well-known 映射 + 注册表 discover/findByCapability/list', () => {
    globalThis.expect(wellKnownPath('https://matrix.yyc3.top/family/tianshu/')).toBe(
      'https://matrix.yyc3.top/family/tianshu/.well-known/agent-card.json',
    );
    const dir = makeDirectory();
    globalThis.expect(dir.size).toBe(2);
    globalThis.expect(slugOf(dir.discover('qianhang'))).toBe('qianhang');
    const byCap = dir.findByCapability('qianhang.nlq-to-api');
    globalThis.expect(byCap?.url.includes('/qianhang')).toBeTruthy();
    globalThis.expect(dir.findByCapability('nobody.none')).toBeFalsy();
    globalThis.expect(dir.list().length).toBe(2);
  });

  it('委托成功：JSON-RPC message/send 构造 + 归一任务句柄 + traceId 贯穿', async () => {
    let captured = null;
    const dir = makeDirectory();
    const client = new DelegateClient({
      directory: dir,
      transport: {
        send: async (url, body) => {
          captured = { url, body: JSON.parse(body) };
          return JSON.stringify({ jsonrpc: '2.0', id: captured.body.id, result: { taskId: 'task-1', state: 'completed' } });
        },
      },
    });
    const result = await client.delegate({ skillId: 'qianhang.nlq-to-api', input: { q: '上月销量' }, traceId: 'trace-42' });
    globalThis.expect(result.ok).toBeTruthy();
    globalThis.expect(result.slug).toBe('qianhang');
    globalThis.expect(result.task.taskId).toBe('task-1');
    globalThis.expect(result.task.state).toBe('completed');
    globalThis.expect(result.traceId).toBe('trace-42');
    globalThis.expect(captured.body.method).toBe(A2A_METHOD);
    globalThis.expect(captured.body.params.traceId).toBe('trace-42');
    globalThis.expect(captured.body.params.skillId).toBe('qianhang.nlq-to-api');
    globalThis.expect(client.deadLetters().length).toBe(0);
  });

  it('超时/传输失败：transport 抛错 → 归一 ok:false + 入 DLQ + 回调（不抛出）', async () => {
    const letters = [];
    const client = new DelegateClient({
      directory: makeDirectory(),
      transport: { send: async () => { throw new Error('timeout after 5000ms'); } },
      onDeadLetter: (l) => letters.push(l),
    });
    const result = await client.delegate({ skillId: 'shared.self-judge', input: {}, traceId: 'trace-t' });
    globalThis.expect(result.ok).toBeFalsy();
    if (!result.reason.includes('timeout')) throw new Error(`失败原因未归一超时：${result.reason}`);
    globalThis.expect(client.deadLetters().length).toBe(1);
    globalThis.expect(letters.length).toBe(1);
    globalThis.expect(client.deadLetters()[0].topic).toBe('a2a.delegate.failed');
    globalThis.expect(client.deadLetters()[0].slug).toBe('tianshu');
  });

  it('非法响应：非 JSON 体 / 上游 error 均 DLQ（不抛出、不归一成功）', async () => {
    const badJson = new DelegateClient({ directory: makeDirectory(), transport: okTransport('not-json{{') });
    const r1 = await badJson.delegate({ skillId: 'shared.self-judge', input: {}, traceId: 'x1' });
    globalThis.expect(r1.ok).toBeFalsy();
    if (!r1.reason.includes('非 JSON')) throw new Error(`非法体未识别：${r1.reason}`);

    const upstream = new DelegateClient({
      directory: makeDirectory(),
      transport: okTransport(JSON.stringify({ jsonrpc: '2.0', id: 'k', error: { code: -32000, message: 'worker 内部错误' } })),
    });
    const r2 = await upstream.delegate({ skillId: 'shared.self-judge', input: {}, traceId: 'x2' });
    globalThis.expect(r2.ok).toBeFalsy();
    if (!r2.reason.includes('-32000')) throw new Error(`上游错误未归一：${r2.reason}`);
    globalThis.expect(upstream.deadLetters().length).toBe(1);
  });

  it('无 card 声明该能力：归一失败并入 DLQ（目录容量提示）', async () => {
    const client = new DelegateClient({ directory: makeDirectory(), transport: okTransport('{}') });
    const result = await client.delegate({ skillId: 'ghost.capability', input: {}, traceId: 'x3' });
    globalThis.expect(result.ok).toBeFalsy();
    if (!result.reason.includes('无 card 声明能力')) throw new Error(`未识别未知能力：${result.reason}`);
    globalThis.expect(client.deadLetters().length).toBe(1);
  });

  it('DLQ 有界：容量 2 时第三次失败淘汰最旧记录', async () => {
    const client = new DelegateClient({
      directory: makeDirectory(),
      transport: { send: async () => { throw new Error('boom'); } },
      dlqCapacity: 2,
      now: () => 0,
    });
    for (const trace of ['a', 'b', 'c']) {
      await client.delegate({ skillId: 'shared.self-judge', input: {}, traceId: trace });
    }
    globalThis.expect(client.deadLetters().length).toBe(2);
    globalThis.expect(client.deadLetters()[0].request.traceId).toBe('b');
    globalThis.expect(client.deadLetters()[1].request.traceId).toBe('c');
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
