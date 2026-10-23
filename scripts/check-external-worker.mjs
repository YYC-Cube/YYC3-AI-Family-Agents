#!/usr/bin/env node
/**
 * 外部 Worker 契约校验（check-external-worker · P2-T1）—— 零依赖。
 *
 * 职责：
 *   1. 模板结构校验：presets/external-worker/worker.yaml.tpl 必需键齐全（默认执行）；
 *   2. 实例契约校验：{workers-dir}/*.worker.yaml 逐份校验——
 *      worker.id 命名（kebab-case，且与八家人 slug 隔离）、endpoint 合法且避开主服务 3030、
 *      auth.scheme 枚举 + token 只引环境变量名不落值、timeout_ms 正整数、
 *      fallback 枚举、capabilities 非空且**逐项对账 manifest 技能 id（不得自造）**、
 *      capabilitiesRef.manifest 指向唯一事实源。
 *
 * 用法：
 *   node scripts/check-external-worker.mjs [--root <dir>] [--workers-dir <dir>] [--file <yaml>] [--json]
 *
 * 验收（01 规划 §7.2 P2-T1）：capability id 与 manifest 对得上；不得自定义能力名。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './lib/yaml-lite.mjs';
import { loadManifest } from './lib/family-manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TPL_FILE = 'presets/external-worker/worker.yaml.tpl';
const WORKERS_DIR = 'presets/external-worker';
const MANIFEST_FILE = 'presets/family-manifest.yaml';
/** 八家人 slug（外部 worker id 命名空间隔离）。 */
const FAMILY_SLUGS = new Set([
  'tianshu', 'qianhang', 'thinker', 'prophet', 'bole', 'guardian', 'grandmaster', 'grace',
]);
/** 模板必需键（结构级）。 */
const TPL_REQUIRED = [
  'worker.id', 'worker.endpoint', 'worker.auth.scheme', 'worker.auth.token_env',
  'worker.timeout_ms', 'worker.fallback', 'worker.capabilities', 'worker.capabilitiesRef.manifest',
];

// ---------- 参数 ----------

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const fileIdx = args.indexOf('--file');
const fileArg = fileIdx >= 0 ? args[fileIdx + 1] : undefined;
const rootIdx = args.indexOf('--root');
const root = rootIdx >= 0 ? path.resolve(args[rootIdx + 1]) : ROOT;
const dirIdx = args.indexOf('--workers-dir');
const workersDir = dirIdx >= 0 ? path.resolve(args[dirIdx + 1]) : path.join(root, WORKERS_DIR);

// ---------- helpers ----------

/** 按点路径取嵌套值。 */
function pick(obj, dotPath) {
  let cur = obj;
  for (const key of dotPath.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[key];
  }
  return cur;
}

/** 模板结构校验（必需键齐全）。 */
function checkTemplate(errors) {
  const tplPath = path.join(root, TPL_FILE);
  if (!existsSync(tplPath)) {
    errors.push(`模板不存在：${TPL_FILE}`);
    return;
  }
  // 模板含 ${VAR} 占位符，不是合法 YAML——按文本行做结构锚点校验
  const text = readFileSync(tplPath, 'utf8');
  for (const dotPath of TPL_REQUIRED) {
    // 取路径末段作为键名锚点（如 worker.auth.token_env → token_env:）
    const leaf = dotPath.split('.').pop();
    if (!new RegExp(`^\\s*${leaf}:`, 'm').test(text)) {
      errors.push(`模板缺少必需键：${dotPath}`);
    }
  }
  if (!text.includes('capabilitiesRef')) errors.push('模板缺少对账锚点 capabilitiesRef');
}

/** 实例契约校验（capability 对账 manifest）。 */
function checkWorkerFile(file, manifestIds, errors, warnings) {
  const rel = path.relative(root, file);
  const doc = parseYaml(readFileSync(file, 'utf8'));
  const worker = doc?.worker;
  if (!worker || typeof worker !== 'object') {
    errors.push(`${rel}：缺少 worker 段`);
    return;
  }
  const id = String(worker.id ?? '');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) errors.push(`${rel}：worker.id 命名不合规：${id}`);
  if (FAMILY_SLUGS.has(id)) errors.push(`${rel}：worker.id 不得使用八家人 slug：${id}`);

  const endpoint = String(worker.endpoint ?? '');
  if (!/^https?:\/\//.test(endpoint)) errors.push(`${rel}：endpoint 须为 http(s) URL：${endpoint}`);
  if (/:3030\b/.test(endpoint)) errors.push(`${rel}：endpoint 不得占用主服务端口 3030：${endpoint}`);

  const auth = worker.auth ?? {};
  if (!['bearer_token', 'api_key'].includes(auth.scheme)) {
    errors.push(`${rel}：auth.scheme 非法（bearer_token|api_key）：${auth.scheme}`);
  }
  const tokenEnv = String(auth.token_env ?? '');
  if (!/^[A-Z][A-Z0-9_]*$/.test(tokenEnv)) {
    errors.push(`${rel}：auth.token_env 须为环境变量名（大写蛇形）：${tokenEnv}`);
  }
  if (worker.auth && 'token' in worker.auth) {
    errors.push(`${rel}：契约不得落令牌值（只允许 token_env 引用）`);
  }

  const timeout = worker.timeout_ms;
  if (!Number.isInteger(timeout) || timeout <= 0) errors.push(`${rel}：timeout_ms 须为正整数：${timeout}`);

  if (!['rule-default', 'drop'].includes(worker.fallback)) {
    errors.push(`${rel}：fallback 非法（rule-default|drop）：${worker.fallback}`);
  }

  const caps = worker.capabilities;
  if (!Array.isArray(caps) || caps.length === 0) {
    errors.push(`${rel}：capabilities 须为非空列表`);
  } else {
    for (const cap of caps) {
      if (!manifestIds.has(cap)) {
        errors.push(`${rel}：capability 未在 manifest 中声明（不得自造）：${cap}`);
      }
    }
    for (const dup of caps.filter((c, i) => caps.indexOf(c) !== i)) {
      warnings.push(`${rel}：capability 重复声明：${dup}`);
    }
  }

  const ref = worker.capabilitiesRef?.manifest;
  if (ref !== MANIFEST_FILE) {
    errors.push(`${rel}：capabilitiesRef.manifest 须指向 ${MANIFEST_FILE}：${ref}`);
  }
}

// ---------- 主流程 ----------

const errors = [];
const warnings = [];
const files = [];

const manifest = loadManifest(root);
const manifestIds = new Set((manifest.skills ?? []).map((s) => s.id));

checkTemplate(errors);

if (fileArg) {
  if (!existsSync(fileArg)) {
    errors.push(`--file 不存在：${fileArg}`);
  } else {
    files.push(path.resolve(fileArg));
  }
} else if (existsSync(workersDir)) {
  files.push(
    ...readdirSync(workersDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.worker.yaml'))
      .map((e) => path.join(workersDir, e.name))
      .sort(),
  );
}

for (const file of files) checkWorkerFile(file, manifestIds, errors, warnings);

const result = {
  ok: errors.length === 0,
  mode: fileArg ? 'file' : 'dir',
  template: TPL_FILE,
  workers: files.map((f) => path.relative(root, f)),
  workerCount: files.length,
  manifestSkills: manifestIds.size,
  warnings,
  errors,
};

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('📦 外部 Worker 契约校验（presets/external-worker · P2-T1）');
  console.log(`   · 模板：${TPL_FILE}（${result.template && errors.some((e) => e.startsWith('模板')) ? '❌' : '✅'}）`);
  console.log(`   · 实例：${files.length} 份 · manifest 技能 ${manifestIds.size} 条（对账事实源）`);
  for (const w of warnings) console.log(`   ⚠ ${w}`);
  for (const e of errors) console.log(`   ❌ ${e}`);
  console.log(result.ok ? '✅ 外部 worker 契约校验通过' : '❌ 外部 worker 契约校验失败');
}

process.exit(result.ok ? 0 : 1);
