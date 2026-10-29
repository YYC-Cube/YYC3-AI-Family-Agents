// @ts-nocheck
/**
 * 外部 Worker 模板契约（worker-template）—— M34 · 复用路线 R5（本地部分）。
 *
 * 验收：
 *   W1 零漂移：check 模式 exit 0——blueprint-13（参照实现）按 committed 实例契约
 *      反解参数重生成，worker.py + 实例 yaml 逐字节一致
 *   W2 新 Worker 生成：--root 隔离输出——worker.py 参数化到位 · 实例契约字段齐备
 *      （含 runtime.script 供 AUTOSTART 例行化）
 *   W3 确定性：同参数两次生成逐字节一致
 *   W4 例行化 e2e：EXT_WORKER_AUTOSTART=1 → 本地 worker 自动拉起 → UAT 3/3
 *      （仅回环 · python3 stdlib · 零外网 · 零计费；真实外部端点仍走三闸 UAT）
 *
 * 运行：tsc 编译 + node（零依赖 harness，范式同 member-template.contract；
 * W4 需 python3（stdlib），门禁环境要求见 README 门禁节）。
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
      if (!actual.includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${String(actual).slice(0, 200)}`);
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

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd(); // 门禁以仓库根为 cwd 运行套件（禁 import.meta 定位）

/** 递归收集文件相对路径。 */
function walkRel(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkRel(abs, base, out);
    else out.push(path.relative(base, abs));
  }
  return out;
}

/** 新 Worker 生成 argv（全字面量——隔离目录经 env YYC3_WORKER_ROOT 注入，不进命令参数向量）。 */
function createEnv(outDir) {
  return { ...process.env, YYC3_WORKER_ROOT: outDir };
}

const CREATE_ARGV = [
  'scripts/create-worker.mjs',
  'create',
  '--id', 'worker-xtest',
  '--name', '试验·外部 Worker',
  '--port', '3141',
  '--skills', 'shared.self-judge,qianhang.nlq-to-api',
];

describe('外部 Worker 模板契约（M34 · R5 本地）', () => {
  it('W1 零漂移：check 模式 exit 0——blueprint-13 参照实现逐字节一致', () => {
    try {
      execFileSync('node', ['scripts/create-worker.mjs', 'check'], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      const detail = String((e && (e.stderr || e.stdout)) || e.message).slice(0, 300);
      throw new Error(`check 非零退出：${detail}`);
    }
  });

  it('W2 新 Worker 生成：worker.py 参数化 · 实例契约齐备（含 runtime.script）', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-worker-create-'));
    execFileSync('node', CREATE_ARGV, {
      cwd: ROOT,
      env: createEnv(out),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const workerPy = fs.readFileSync(path.join(out, 'workers', 'worker-xtest', 'worker.py'), 'utf8');
    expect(workerPy).toContain('worker-xtest');
    expect(workerPy).toContain('试验·外部 Worker');
    expect(workerPy).toContain('"shared.self-judge"');
    expect(workerPy).not.toContain('blueprint-13');
    expect(workerPy).not.toContain('{{');
    const yaml = fs.readFileSync(path.join(out, 'presets', 'external-worker', 'worker-xtest.worker.yaml'), 'utf8');
    expect(yaml).toContain('http://127.0.0.1:3141');
    expect(yaml).toContain('WORKER_XTEST_TOKEN');
    expect(yaml).toContain('script: workers/worker-xtest/worker.py');
    fs.rmSync(out, { recursive: true, force: true });
  });

  it('W3 确定性：同参数两次生成逐字节一致', () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-worker-det-a-'));
    const b = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-worker-det-b-'));
    execFileSync('node', CREATE_ARGV, { cwd: ROOT, env: createEnv(a), stdio: ['ignore', 'pipe', 'pipe'] });
    execFileSync('node', CREATE_ARGV, { cwd: ROOT, env: createEnv(b), stdio: ['ignore', 'pipe', 'pipe'] });
    const relsA = walkRel(path.join(a, 'workers/worker-xtest')).sort();
    const relsB = walkRel(path.join(b, 'workers/worker-xtest')).sort();
    expect(relsA.join('|')).toBe(relsB.join('|'));
    for (const rel of relsA) {
      expect(fs.readFileSync(path.join(a, 'workers/worker-xtest', rel)).equals(
        fs.readFileSync(path.join(b, 'workers/worker-xtest', rel)),
      )).toBeTruthy();
    }
    fs.rmSync(a, { recursive: true, force: true });
    fs.rmSync(b, { recursive: true, force: true });
  });

  it('W4 例行化 e2e：AUTOSTART 拉起本地 worker → UAT 3/3（回环 · 零外网）', () => {
    const out = execFileSync('node', ['scripts/run-external-uats.mjs'], {
      cwd: ROOT,
      env: {
        ...process.env,
        EXT_WORKER: '1',
        EXT_WORKER_CONFIRM: '我知晓外部端点调用',
        EXT_WORKER_AUTOSTART: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 100_000,
    });
    const text = out.toString();
    expect(text).toContain('AUTOSTART：已拉起本地 worker');
    expect(text).toContain('AUTOSTART：worker 就绪');
    expect(text).toContain('任务委托：JSON-RPC tasks/send 可达并归一结果');
    expect(text).toContain('3 通过 / 0 失败');
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
