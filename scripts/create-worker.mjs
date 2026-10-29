#!/usr/bin/env node
/**
 * 外部 Worker 脚手架 CLI（create-worker.mjs）—— M34 · 复用路线 R5（本地部分）。
 *
 * 模板源：workers/blueprint-13/worker.py（参照实现 · stdlib 零依赖 · 仅回环）
 *         + presets/external-worker/blueprint-13.worker.yaml（实例契约）。
 * 与 scripts/create-member.mjs 同范式（R4）：create + check 零漂移。
 *
 * create：生成 workers/<id>/worker.py（参数化）+ presets/external-worker/<id>.worker.yaml
 *         （实例契约 · 含 runtime.script 供 uat:external AUTOSTART 例行化）。
 * check ：blueprint-13 零漂移——按 committed 实例契约反解参数 → 重生成 → 逐字节比对。
 *
 * 用法：
 *   node scripts/create-worker.mjs create --id worker-x --name "<名称>" --port 3140 \
 *     --skills shared.self-judge,qianhang.nlq-to-api [--token-env WORKER_X_TOKEN] \
 *     [--timeout 5000] [--fallback rule-default] [--root <dir>]
 *   node scripts/create-worker.mjs check
 *
 * 红线：capabilities 只能引用 presets/family-manifest.yaml 技能 id（生成后运行
 * pnpm external:check 对账）；令牌只走环境变量名引用；id 禁用八家人 slug。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCE_DIR = path.join(ROOT, 'workers', 'blueprint-13');
const REFERENCE_PY = path.join(REFERENCE_DIR, 'worker.py');
const REFERENCE_YAML = path.join(ROOT, 'presets', 'external-worker', 'blueprint-13.worker.yaml');
const FAMILY_SLUGS = new Set([
  'tianshu', 'qianhang', 'thinker', 'prophet', 'bole', 'guardian', 'grandmaster', 'grace',
]);

/** 反解 blueprint-13 → 模板（占位符化），再正向参数化（R4 同源范式）。 */
function workerPyTemplate() {
  const src = fs.readFileSync(REFERENCE_PY, 'utf8');
  const name = src.match(/"agentCard":\s*\{[\s\S]*?"name": "([^"]+)"/)?.[1];
  const skills = src.match(/SKILLS = \[(.*?)\]/)?.[1];
  if (!name || !skills) throw new Error('参照 worker.py 形态异常（card name / SKILLS 不可解析）');
  return src
    .replace(`SKILLS = [${skills}]`, 'SKILLS = {{WORKER_SKILLS}}')
    .replace(`"${name}"`, '"{{WORKER_NAME}}"')
    .replaceAll('blueprint-13', '{{WORKER_ID}}')
    .replace(/os\.environ\.get\("WORKER_PORT", "3130"\)/, 'os.environ.get("WORKER_PORT", "{{WORKER_PORT}}")');
}

function instanceYamlTemplate() {
  const src = fs.readFileSync(REFERENCE_YAML, 'utf8');
  return src
    .replace(/^  id: blueprint-13$/m, '  id: {{WORKER_ID}}')
    .replace(/^  endpoint: http:\/\/127\.0\.0\.1:3130$/m, '  endpoint: http://127.0.0.1:{{WORKER_PORT}}')
    .replace(/^    token_env: WORKER_13_TOKEN$/m, '    token_env: {{WORKER_TOKEN_ENV}}')
    .replace(/^    script: workers\/blueprint-13\/worker\.py$/m, '    script: workers/{{WORKER_ID}}/worker.py')
    .replace(/^  timeout_ms: 5000$/m, '  timeout_ms: {{WORKER_TIMEOUT_MS}}')
    .replace(/(  fallback: )rule-default/, '$1{{WORKER_FALLBACK}}')
    .replace(/(  capabilities:\n)((?:    - .*\n)+)/, '$1{{WORKER_CAPABILITIES}}');
}

function substitute(text, params) {
  return text
    .replaceAll('{{WORKER_ID}}', params.id)
    .replaceAll('{{WORKER_NAME}}', params.name)
    .replaceAll('{{WORKER_SKILLS}}', params.skillsLiteral)
    .replaceAll('{{WORKER_PORT}}', String(params.port))
    .replaceAll('{{WORKER_TOKEN_ENV}}', params.tokenEnv)
    .replaceAll('{{WORKER_TIMEOUT_MS}}', String(params.timeout))
    .replaceAll('{{WORKER_FALLBACK}}', params.fallback)
    .replaceAll('{{WORKER_CAPABILITIES}}', params.capabilitiesLiteral);
}

/** 反解参数（零漂移源：committed 实例契约 + worker.py card name）。 */
function paramsFromCommitted() {
  const yaml = fs.readFileSync(REFERENCE_YAML, 'utf8');
  const field = (key) => yaml.match(new RegExp(`^\\s*${key}:\\s*(\\S+)\\s*$`, 'm'))?.[1];
  const caps = [...yaml.matchAll(/^    - (\S+)$/gm)].map((m) => m[1]);
  const py = fs.readFileSync(REFERENCE_PY, 'utf8');
  const name = py.match(/"agentCard":\s*\{[\s\S]*?"name": "([^"]+)"/)?.[1];
  return {
    id: field('id'),
    port: (field('endpoint') ?? '').match(/:(\d+)\s*$/)?.[1] ?? '',
    tokenEnv: field('token_env'),
    timeout: field('timeout_ms'),
    fallback: field('fallback'),
    capabilities: caps,
    name: name ?? '',
  };
}

/* ------------------------------------------------------------------ */

function checkMode() {
  const params = paramsFromCommitted();
  if (!params.id || !params.port) {
    console.error('❌ 参照实例反解失败（id / endpoint）');
    process.exit(1);
  }
  params.skillsLiteral = JSON.stringify(params.capabilities).replaceAll('","', '", "');
  params.capabilitiesLiteral = `${params.capabilities.map((c) => `    - ${c}`).join('\n')}\n`;

  const failures = [];
  const regenPy = substitute(workerPyTemplate(), params);
  const regenYaml = substitute(instanceYamlTemplate(), params);
  if (regenPy !== fs.readFileSync(REFERENCE_PY, 'utf8')) failures.push('workers/blueprint-13/worker.py：内容漂移');
  if (regenYaml !== fs.readFileSync(REFERENCE_YAML, 'utf8')) failures.push('presets/external-worker/blueprint-13.worker.yaml：内容漂移');

  if (failures.length > 0) {
    console.error(`❌ 外部 Worker 模板零漂移校验失败：`);
    for (const line of failures) console.error(`  - ${line}`);
    process.exit(1);
  }
  console.log(`✅ 外部 Worker 模板零漂移：blueprint-13（参照实现）逐字节一致`);
}

function createMode(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) args[argv[i]] = argv[i + 1] ?? '';
  }
  const p = {
    id: args['--id'] ?? '',
    name: args['--name'] ?? `${args['--id'] ?? 'worker'} 外部 Worker`,
    port: args['--port'] ?? '',
    skills: (args['--skills'] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    tokenEnv: args['--token-env'] ?? `WORKER_${(args['--id'] ?? 'x').replaceAll(/-/g, '_').toUpperCase()}_TOKEN`,
    timeout: args['--timeout'] ?? '5000',
    fallback: args['--fallback'] ?? 'rule-default',
    // 输出根：--root 参数优先；env YYC3_WORKER_ROOT 供契约测试隔离（避免动态路径进命令参数向量）
    root: path.resolve(args['--root'] ?? process.env.YYC3_WORKER_ROOT ?? ROOT),
  };
  const fail = (msg) => {
    console.error(`错误：${msg}`);
    process.exit(1);
  };
  if (!p.id.startsWith('worker-')) fail(`--id 必须以 'worker-' 开头，当前为 '${p.id}'`);
  if (FAMILY_SLUGS.has(p.id.replace(/^worker-/, ''))) fail('--id 禁用八家人 slug（命名空间隔离）');
  if (!/^\d{4,5}$/.test(p.port)) fail(`--port 必须为 4–5 位数字端口，当前为 '${p.port}'`);
  if (p.port === '3030') fail('--port 3030 为主服务端口，须避开');
  if (p.skills.length === 0) fail('--skills 必须为逗号分隔的 manifest 技能 id（生成后运行 pnpm external:check 对账）');
  p.skillsLiteral = JSON.stringify(p.skills).replaceAll('","', '", "');
  p.capabilitiesLiteral = `${p.skills.map((c) => `    - ${c}`).join('\n')}\n`;

  const workerDir = path.resolve(p.root, 'workers', p.id);
  const yamlFile = path.resolve(p.root, 'presets', 'external-worker', `${p.id}.worker.yaml`);
  for (const target of [workerDir, yamlFile]) {
    if (!target.startsWith(path.resolve(p.root) + path.sep)) fail('输出越出根目录');
    if (fs.existsSync(target)) fail(`目标已存在，禁止覆盖 —— ${target}`);
  }

  fs.mkdirSync(workerDir, { recursive: true });
  fs.writeFileSync(path.join(workerDir, 'worker.py'), substitute(workerPyTemplate(), p));
  fs.mkdirSync(path.dirname(yamlFile), { recursive: true });
  fs.writeFileSync(yamlFile, substitute(instanceYamlTemplate(), p));

  console.log(`✅ 已创建外部 Worker：${p.id}（:${p.port} · ${p.skills.length} 能力）`);
  console.log(`   worker.py：workers/${p.id}/worker.py`);
  console.log(`   实例契约：presets/external-worker/${p.id}.worker.yaml`);
  console.log('下一步：pnpm external:check（能力对账 manifest）；EXT_WORKER_AUTOSTART=1 时 uat:external 可自动拉起');
}

/* ------------------------------------------------------------------ */

const mode = process.argv[2];
if (mode === 'check') checkMode();
else if (mode === 'create') createMode(process.argv.slice(3));
else {
  console.error('用法：node scripts/create-worker.mjs create <flags> | check');
  process.exit(1);
}
