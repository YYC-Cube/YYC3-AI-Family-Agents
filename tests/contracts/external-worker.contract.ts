// @ts-nocheck
/**
 * 外部 Worker 契约测试（external-worker.contract）—— P2-T1。
 * 门禁映射：capability id 与 manifest 对齐（不得自造）；鉴权只引环境变量名；
 *   endpoint 避开主服务 3030；八家人 slug 命名空间隔离；模板结构锚点齐全。
 * 设计：spawnSync 真实 CLI（--root/--file/--json 虚拟环境），pack-plugins.contract 同范式。
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const SCRIPT = 'scripts/check-external-worker.mjs';
const TPL = 'presets/external-worker/worker.yaml.tpl';
const MANIFEST = 'presets/family-manifest.yaml';

function run(args) {
  const res = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`未找到 JSON 输出：${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1));
}

/** 虚拟 root：拷贝模板 + manifest，供实例用例隔离运行。 */
function makeTempRoot() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'yyc3-worker-'));
  mkdirSync(path.join(tmp, 'presets', 'external-worker'), { recursive: true });
  cpSync(path.join(ROOT, MANIFEST), path.join(tmp, MANIFEST));
  cpSync(path.join(ROOT, TPL), path.join(tmp, TPL));
  return tmp;
}

/** 合法实例（capability 引用 manifest 真实技能 id）。 */
const VALID_WORKER = `worker:
  id: blueprint-13
  endpoint: http://127.0.0.1:3130
  auth:
    scheme: bearer_token
    token_env: WORKER_13_TOKEN
  timeout_ms: 5000
  fallback: rule-default
  capabilities:
    - qianhang.nlq-to-api
    - shared.llm-invoke
  capabilitiesRef:
    manifest: presets/family-manifest.yaml
`;

function writeWorker(tmp, body) {
  writeFileSync(path.join(tmp, 'presets', 'external-worker', 'blueprint-13.worker.yaml'), body, 'utf8');
}

const rootRun = run(['--json']);
const rootReport = extractJson(rootRun.stdout);

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

describe('外部 Worker 契约（P2-T1）', () => {
  it('模板结构校验通过（仓库根默认执行，0 实例 · manifest 45 条事实源）', () => {
    globalThis.expect(rootRun.status).toBe(0);
    globalThis.expect(rootReport.ok).toBeTruthy();
    globalThis.expect(rootReport.workerCount).toBe(0);
    globalThis.expect(rootReport.manifestSkills).toBe(45);
    globalThis.expect(existsSync(path.join(ROOT, TPL))).toBeTruthy();
  });

  it('合法实例通过：capability 逐项对账 manifest（含 shared 与 dedicated 各一）', () => {
    const tmp = makeTempRoot();
    writeWorker(tmp, VALID_WORKER);
    const out = extractJson(run(['--json', '--root', tmp]).stdout);
    globalThis.expect(out.ok).toBeTruthy();
    globalThis.expect(out.workers.length).toBe(1);
    globalThis.expect(out.workers[0]).toBe('presets/external-worker/blueprint-13.worker.yaml');
    globalThis.expect(out.errors.length).toBe(0);
  });

  it('自造能力名被拒绝（manifest 未声明 → 「不得自造」）', () => {
    const tmp = makeTempRoot();
    writeWorker(tmp, VALID_WORKER.replace('qianhang.nlq-to-api', 'worker-13.super-codegen'));
    const out = extractJson(run(['--json', '--root', tmp]).stdout);
    globalThis.expect(out.ok).toBeFalsy();
    const msg = out.errors.join('\n');
    if (!msg.includes('不得自造')) throw new Error(`未拦截自造能力名：${msg}`);
    if (!msg.includes('worker-13.super-codegen')) throw new Error('错误信息未指出越界能力 id');
  });

  it('契约落令牌值被拒绝（auth.token → 只允许 token_env 引用）', () => {
    const tmp = makeTempRoot();
    writeWorker(tmp, VALID_WORKER.replace('    token_env: WORKER_13_TOKEN\n', '    token_env: WORKER_13_TOKEN\n    token: sk-should-not-exist\n'));
    const out = extractJson(run(['--json', '--root', tmp]).stdout);
    globalThis.expect(out.ok).toBeFalsy();
    if (!out.errors.join('\n').includes('不得落令牌值')) throw new Error(`未拦截令牌落值：${out.errors.join('\n')}`);
  });

  it('endpoint 占用主服务端口 3030 被拒绝', () => {
    const tmp = makeTempRoot();
    writeWorker(tmp, VALID_WORKER.replace('http://127.0.0.1:3130', 'http://127.0.0.1:3030'));
    const out = extractJson(run(['--json', '--root', tmp]).stdout);
    globalThis.expect(out.ok).toBeFalsy();
    if (!out.errors.join('\n').includes('3030')) throw new Error(`未拦截 3030 端口：${out.errors.join('\n')}`);
  });

  it('worker.id 与八家人 slug 冲突被拒绝（命名空间隔离）', () => {
    const tmp = makeTempRoot();
    writeWorker(tmp, VALID_WORKER.replace('id: blueprint-13', 'id: qianhang'));
    const out = extractJson(run(['--json', '--root', tmp]).stdout);
    globalThis.expect(out.ok).toBeFalsy();
    if (!out.errors.join('\n').includes('八家人 slug')) throw new Error(`未拦截家人 slug 冲突：${out.errors.join('\n')}`);
  });

  it('capabilitiesRef 指错事实源被拒绝；模板缺键可检出（fallback 锚点移除）', () => {
    const tmp = makeTempRoot();
    writeWorker(tmp, VALID_WORKER.replace('manifest: presets/family-manifest.yaml', 'manifest: presets/other.yaml'));
    const out = extractJson(run(['--json', '--root', tmp]).stdout);
    globalThis.expect(out.ok).toBeFalsy();
    if (!out.errors.join('\n').includes('capabilitiesRef.manifest')) {
      throw new Error(`未拦截对账锚点漂移：${out.errors.join('\n')}`);
    }

    // 夹具改写仅限临时根目录内（路径包含守卫，防御性收窄写入面）
    const rootDir = path.resolve(tmp);
    const tplPath = path.resolve(rootDir, TPL);
    if (!tplPath.startsWith(rootDir + path.sep)) throw new Error('夹具写入越界（意外路径穿越）');
    const stripped = readFileSync(tplPath, 'utf8')
      .split('\n')
      .filter((l) => !/^  fallback:/.test(l))
      .join('\n');
    writeFileSync(tplPath, stripped, 'utf8');
    const out2 = extractJson(run(['--json', '--root', tmp]).stdout);
    globalThis.expect(out2.ok).toBeFalsy();
    if (!out2.errors.join('\n').includes('模板缺少必需键：worker.fallback')) {
      throw new Error(`模板缺键未检出：${out2.errors.join('\n')}`);
    }
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
