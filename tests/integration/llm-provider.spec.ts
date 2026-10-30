// @ts-nocheck
/**
 * LLM Provider 测试（llm-provider）—— P1 智谱接入（真实 HTTP 协议，本地桩服务）。
 *
 * 覆盖：
 *   L1 标准补全（URL/鉴权/请求体/响应整形）
 *   L2 重试（500 → 500 → 200，指数退避）
 *   L3 不可重试错误（401 立即失败）
 *   L4 超时（AbortController）
 *   L5 SSE 流式增量
 *   L6 isAvailable（环境变量存在性）
 *   O1 OpenAI 补全（Bearer / 组织头 / 响应整形）
 *   O2 OpenAI isAvailable 不受 ZHIPU_API_KEY 影响
 *   E0c-1 思考型响应 reasoning_content 透传（content 空不崩 · 可计量）
 *   E0c-2 reasoning 请求字段透传（enabled + budgetTokens）
 *   E0c-3 LlmUsageCounter 三维分桶（tags 聚合 · 快照导出 · 无 tags 归总量）
 *   E0c-4 runner maxTokens 配置注入（createLlmStepRunner 第三参）
 *
 * 安全：全程使用假密钥 `test-key`，不读取、不打印真实密钥。
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
    not: {
      toContain: (exp) => {
        if (String(actual).includes(exp)) throw new Error(`期望不含 ${JSON.stringify(exp)}，实际 ${String(actual).slice(0, 200)}`);
      },
    },
  });
}

import http from 'node:http';
import { ZhiPuProvider } from '@shared/llm-adapter/zhipu-provider.js';
import { OpenAiProvider } from '@shared/llm-adapter/openai-provider.js';
import {
  LlmUsageCounter,
  createLlmStepRunner,
} from '@shared/llm-adapter/skill-step-executor.js';

/** 启动本地桩服务，返回 baseUrl、请求记录与关闭函数。 */
async function listen(handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      handler(req, res, body, requests.length);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((r) => server.close(r)),
  };
}

/** 临时设置/恢复环境变量。 */
async function withKey(value, fn) {
  const prev = process.env.ZHIPU_API_KEY;
  if (value === undefined) delete process.env.ZHIPU_API_KEY;
  else process.env.ZHIPU_API_KEY = value;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.ZHIPU_API_KEY;
    else process.env.ZHIPU_API_KEY = prev;
  }
}

const REQ = {
  model: 'glm-4-flash',
  messages: [
    { role: 'system', content: '你是言启·千行' },
    { role: 'user', content: '整理会议纪要' },
  ],
  temperature: 0.3,
  maxTokens: 256,
};

describe('LLM Provider（zhipu）', () => {
  it('L1: 标准补全（URL / Bearer / 请求体 / 响应整形）', async () => {
    const stub = await listen((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{
          message: { content: '已整理为 3 条待办' },
          finish_reason: 'stop',
          logprobs: { content: [{ logprob: -0.12 }, { logprob: -0.08 }] },
        }],
        usage: { prompt_tokens: 21, completion_tokens: 9 },
      }));
    });
    try {
      const provider = new ZhiPuProvider('ZHIPU_API_KEY', stub.baseUrl);
      const out = await withKey('test-key', () => provider.complete(REQ));

      expect(stub.requests.length).toBe(1);
      const r = stub.requests[0];
      expect(r.method).toBe('POST');
      expect(r.url).toBe('/chat/completions');
      expect(r.headers.authorization).toBe('Bearer test-key');
      const body = JSON.parse(r.body);
      expect(body.model).toBe('glm-4-flash');
      expect(body.messages.length).toBe(2);
      expect(body.temperature).toBe(0.3);
      expect(body.max_tokens).toBe(256);

      expect(out.text).toBe('已整理为 3 条待办');
      expect(out.finishReason).toBe('stop');
      expect(out.usage.promptTokens).toBe(21);
      expect(out.usage.completionTokens).toBe(9);
      expect(out.logprobs).toBeTruthy();
      expect(out.logprobs.length).toBe(2);
    } finally {
      await stub.close();
    }
  });

  it('L2: 重试（500 → 500 → 200）', async () => {
    const stub = await listen((_req, res, _body, count) => {
      if (count < 3) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'temporary' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: '重试成功' }, finish_reason: 'stop' }], usage: {} }));
    });
    try {
      const provider = new ZhiPuProvider('ZHIPU_API_KEY', stub.baseUrl, { maxRetries: 2, retryBaseMs: 1 });
      const out = await withKey('test-key', () => provider.complete(REQ));
      expect(out.text).toBe('重试成功');
      expect(stub.requests.length).toBe(3);
    } finally {
      await stub.close();
    }
  });

  it('L3: 401 不可重试（只请求一次）', async () => {
    const stub = await listen((_req, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid api key' }));
    });
    try {
      const provider = new ZhiPuProvider('ZHIPU_API_KEY', stub.baseUrl, { maxRetries: 2, retryBaseMs: 1 });
      let error;
      try {
        await withKey('bad-key', () => provider.complete(REQ));
      } catch (e) {
        error = e;
      }
      expect(error?.name).toBe('ProviderError');
      expect(error?.status).toBe(401);
      expect(stub.requests.length).toBe(1);
      expect(String(error?.message).includes('bad-key')).toBe(false); // 不回显密钥
    } finally {
      await stub.close();
    }
  });

  it('L4: 超时（AbortController）', async () => {
    const stub = await listen((_req, res) => {
      setTimeout(() => {
        if (!res.writableEnded) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{}');
        }
      }, 300);
    });
    try {
      const provider = new ZhiPuProvider('ZHIPU_API_KEY', stub.baseUrl, { timeoutMs: 30, maxRetries: 0 });
      let error;
      try {
        await withKey('test-key', () => provider.complete(REQ));
      } catch (e) {
        error = e;
      }
      expect(String(error?.message)).toContain('超时');
    } finally {
      await stub.close();
    }
  });

  it('L5: SSE 流式（增量拼接 + [DONE]）', async () => {
    const stub = await listen((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"你"}}]}\n\n');
      res.write('data: {"choices":[{"delta":{"content":"好"}}]}\n\n');
      res.write('data: {"choices":[{"delta":{"content":"世界"}}]}\n\n');
      res.end('data: [DONE]\n\n');
    });
    try {
      const provider = new ZhiPuProvider('ZHIPU_API_KEY', stub.baseUrl);
      const parts = [];
      await withKey('test-key', async () => {
        for await (const piece of provider.stream(REQ)) parts.push(piece);
      });
      expect(parts.join('')).toBe('你好世界');
      expect(stub.requests[0].headers.accept).toBe('text/event-stream');
      expect(JSON.parse(stub.requests[0].body).stream).toBe(true);
    } finally {
      await stub.close();
    }
  });

  it('L6: isAvailable 仅取决于环境变量', async () => {
    const provider = new ZhiPuProvider('ZHIPU_API_KEY', 'http://127.0.0.1:1');
    await withKey(undefined, async () => {
      expect(provider.isAvailable()).toBe(false);
    });
    await withKey('test-key', async () => {
      expect(provider.isAvailable()).toBe(true);
    });
  });

  it('O1: OpenAI 补全（Bearer / 组织头 / 响应整形）', async () => {
    const stub = await listen((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { content: 'OpenAI 适配成功' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      }));
    });
    const prev = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test';
    try {
      const provider = new OpenAiProvider('OPENAI_API_KEY', stub.baseUrl, { organization: 'org-test' });
      const out = await provider.complete(REQ);

      expect(stub.requests.length).toBe(1);
      const r = stub.requests[0];
      expect(r.url).toBe('/chat/completions');
      expect(r.headers.authorization).toBe('Bearer sk-test');
      expect(r.headers['openai-organization']).toBe('org-test');
      expect(out.text).toBe('OpenAI 适配成功');
      expect(out.usage.promptTokens).toBe(5);
    } finally {
      await stub.close();
      if (prev === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prev;
    }
  });

  it('O2: OpenAI isAvailable 不受 ZHIPU_API_KEY 影响', async () => {
    const provider = new OpenAiProvider('OPENAI_API_KEY', 'http://127.0.0.1:1');
    const prevOpen = process.env.OPENAI_API_KEY;
    const prevZhipu = process.env.ZHIPU_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.ZHIPU_API_KEY = 'zhipu-only';
    try {
      expect(provider.isAvailable()).toBe(false); // 仅智谱 Key 不算可用
      process.env.OPENAI_API_KEY = 'sk-x';
      expect(provider.isAvailable()).toBe(true);
    } finally {
      if (prevOpen === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevOpen;
      if (prevZhipu === undefined) delete process.env.ZHIPU_API_KEY;
      else process.env.ZHIPU_API_KEY = prevZhipu;
    }
  });

  it('E0c-1: 思考型响应 reasoning_content 透传（content 空不崩 · 可计量）', async () => {
    const stub = await listen((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{
          message: { reasoning_content: '思考过程——先取口径再对比环比' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 12, completion_tokens: 40 },
      }));
    });
    try {
      const provider = new ZhiPuProvider('ZHIPU_API_KEY', stub.baseUrl);
      const out = await withKey('test-key', () => provider.complete({ ...REQ, maxTokens: 3072 }));
      expect(out.text).toBe(''); // content 空：不崩、text 置空
      expect(out.reasoningContent).toBe('思考过程——先取口径再对比环比'); // 透传供观测/审计
      expect(out.usage.completionTokens).toBe(40); // usage 照常计量
      const body = JSON.parse(stub.requests[0].body);
      expect(body.max_tokens).toBe(3072); // maxTokens 配置注入生效（E0c）
    } finally {
      await stub.close();
    }
  });

  it('E0c-2: reasoning 请求字段透传（enabled + budgetTokens）', async () => {
    const stub = await listen((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      }));
    });
    try {
      const provider = new ZhiPuProvider('ZHIPU_API_KEY', stub.baseUrl);
      await withKey('test-key', () =>
        provider.complete({ ...REQ, reasoning: { enabled: true, budgetTokens: 3072 } }));
      const body = JSON.parse(stub.requests[0].body);
      expect(body.reasoning.enabled).toBe(true);
      expect(body.reasoning.budgetTokens).toBe(3072);
    } finally {
      await stub.close();
    }
  });

  it('E0c-3: LlmUsageCounter 三维分桶（tags 聚合 · 快照导出 · 无 tags 归总量）', () => {
    const counter = new LlmUsageCounter();
    counter.record({ promptTokens: 10, completionTokens: 5 }, { skillId: 'skill-a', scenario: 'llm-assisted' });
    counter.record({ promptTokens: 20, completionTokens: 8 }, { skillId: 'skill-b', scenario: 'llm-assisted' });
    counter.record({ promptTokens: 1, completionTokens: 1 }); // 无 tags：仅总量（向后兼容）
    const snap = counter.snapshot();
    expect(snap.totalTokens).toBe(45);
    expect(snap.buckets).toHaveLength(2);
    const bySkill = new Map(snap.buckets.map((b) => [b.skillId, b]));
    expect(bySkill.get('skill-a').totalTokens).toBe(15);
    expect(bySkill.get('skill-b').totalTokens).toBe(28);
    expect(bySkill.get('skill-a').scenario).toBe('llm-assisted');
  });

  it('E0c-4: runner maxTokens 配置注入（createLlmStepRunner 第三参）', async () => {
    let captured;
    const fakeProvider = {
      complete: async (req) => {
        captured = req;
        return { text: 'x', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 } };
      },
    };
    const runner = createLlmStepRunner(fakeProvider, 'glm-4-flash', 3072);
    await runner([{ role: 'user', content: 'hi' }]);
    expect(captured.maxTokens).toBe(3072);
    const runnerDefault = createLlmStepRunner(fakeProvider, 'glm-4-flash');
    await runnerDefault([]);
    expect(captured.maxTokens).toBe(1024); // 缺省向后兼容
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
