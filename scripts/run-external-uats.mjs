#!/usr/bin/env node
/**
 * 外部 Worker UAT 运行器（run-external-uats · P2-T3）—— 三闸门控，默认跳过。
 *
 * 与 scripts/run-uat-llm.mjs 同构（隔离编译：临时目录 tsconfig + loader/register），
 * 但打**外部 worker 真实端点**（蓝图 13 Python 族等），三闸缺一整体跳过、exit 0：
 *   闸 1：EXT_WORKER=1
 *   闸 2：EXT_WORKER_CONFIRM=我知晓外部端点调用
 *   闸 3：端点存在（EXT_WORKER_ENDPOINT 环境变量，或
 *          presets/external-worker/*.worker.yaml 实例（取第一份的 endpoint，能力先经
 *          check-external-worker 对账 manifest））
 *
 * 用法：
 *   EXT_WORKER=1 EXT_WORKER_CONFIRM=我知晓外部端点调用 pnpm uat:external
 *   端点优先级：EXT_WORKER_ENDPOINT env > 实例文件；EXT_WORKER_TIMEOUT_MS 可覆盖委托超时。
 *   YYC3_KEEP_TMP=1 保留临时编译目录（调试）。
 *
 * 安全：本脚本不读取、不回显令牌（token 只引用环境变量名，值由 worker 端校验）。
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = 'tests/uat/external-worker-uat.spec.ts';
const WORKERS_DIR = path.join(ROOT, 'presets', 'external-worker');

// ---------- 三闸门控 ----------

console.log('ⓔ 外部 Worker UAT 预检（不回显令牌值）：');
console.log(`   EXT_WORKER=${process.env.EXT_WORKER ?? '（未设置）'}  EXT_WORKER_CONFIRM=${process.env.EXT_WORKER_CONFIRM ?? '（未设置）'}`);

let endpoint = process.env.EXT_WORKER_ENDPOINT ?? '';
let endpointSource = 'env:EXT_WORKER_ENDPOINT';

if (!endpoint) {
  // 闸 3 备选：实例文件（能力已经 check-external-worker 对账 manifest）
  const instances = fs.existsSync(WORKERS_DIR)
    ? fs.readdirSync(WORKERS_DIR, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.worker.yaml'))
        .map((e) => e.name)
        .sort()
    : [];
  if (instances.length > 0) {
    // 零依赖轻量提取：endpoint: 行（实例由契约校验保证结构）
    const text = fs.readFileSync(path.join(WORKERS_DIR, instances[0]), 'utf8');
    const found = text.match(/^\s*endpoint:\s*(\S+)\s*$/m);
    if (found) {
      endpoint = found[1];
      endpointSource = `实例:${instances[0]}`;
    }
  }
}

console.log(`   端点：${endpoint || '（缺失）'}（来源：${endpointSource}）`);

if (process.env.EXT_WORKER !== '1' || process.env.EXT_WORKER_CONFIRM !== '我知晓外部端点调用' || !endpoint) {
  console.log('⏭ 三闸未放行（默认跳过，exit 0）——真实外部端点调用须：EXT_WORKER=1 + 确认语 + 端点存在');
  process.exit(0);
}

// ---------- 隔离编译环境（与 run-uat-llm.mjs 约定一致） ----------

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-extuat-'));
const buildDir = path.join(tmp, 'build');
const abs = (p) => path.join(ROOT, p);

fs.writeFileSync(
  path.join(tmp, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        lib: ['ES2022', 'DOM'],
        strict: true,
        noImplicitAny: true,
        noImplicitOverride: true,
        noFallthroughCasesInSwitch: true,
        declaration: false,
        declarationMap: false,
        sourceMap: false,
        noEmit: false,
        outDir: buildDir,
        rootDir: ROOT,
        skipLibCheck: true,
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        isolatedModules: true,
        verbatimModuleSyntax: true,
        paths: {
          '@shared/*': [path.join(ROOT, 'family-agents', 'shared-core', '*')],
          '@members/*': [path.join(ROOT, 'family-agents', '*')],
        },
      },
      include: [abs('architecture-kernel/**/*.ts'), abs('family-agents/**/*.ts'), abs('tests/**/*.ts')],
      exclude: [abs('node_modules'), abs('dist'), abs('family-agents/**/tests/**'), '**/*.tpl'],
    },
    null,
    2,
  ),
);

fs.writeFileSync(
  path.join(tmp, 'loader.mjs'),
  `import path from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const BUILD = ${JSON.stringify(buildDir)};
const MEMBERS = path.join(BUILD, 'family-agents');

function fileOf(base) {
  if (existsSync(base) && !base.endsWith('.js') && !base.endsWith('.json')) return path.join(base, 'index.js');
  return base.endsWith('.js') || base.endsWith('.json') ? base : base + '.js';
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@shared/')) {
    return next(pathToFileURL(fileOf(path.join(MEMBERS, 'shared-core', specifier.slice('@shared/'.length)))).href);
  }
  if (specifier.startsWith('@members/')) {
    return next(pathToFileURL(fileOf(path.join(MEMBERS, specifier.slice('@members/'.length)))).href);
  }
  return next(specifier, context);
}
`,
);

fs.writeFileSync(
  path.join(tmp, 'register.mjs'),
  `import { register } from 'node:module';
register(new URL('./loader.mjs', import.meta.url));
`,
);

// ---------- 编译 + 运行 ----------

function cleanup(code) {
  if (process.env.YYC3_KEEP_TMP) {
    console.log(`🧷 临时目录保留（YYC3_KEEP_TMP=1）：${tmp}`);
  } else {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  process.exit(code);
}

console.log('⏳ 编译中（隔离临时环境）…');
const tscLocal = path.join(ROOT, 'node_modules', '.bin', 'tsc');
try {
  execFileSync(fs.existsSync(tscLocal) ? tscLocal : 'tsc', ['-p', path.join(tmp, 'tsconfig.json')], {
    stdio: 'inherit',
    cwd: ROOT,
  });
} catch {
  console.error('❌ 编译失败（tsc 非零退出）');
  cleanup(1);
}

const target = path.join(buildDir, SPEC.replace(/\.ts$/, '.js'));
if (!fs.existsSync(target)) {
  console.error(`❌ 产物缺失：${SPEC}`);
  cleanup(1);
}

console.log('▶ 运行外部 Worker UAT（真实端点，受三闸保护）…');
const r = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(tmp, 'register.mjs')).href, target], {
  cwd: ROOT,
  stdio: 'inherit',
  timeout: 120_000,
});
if (r.error) {
  console.error(`❌ 运行异常：${r.error.message}`);
  cleanup(1);
}
cleanup(r.status ?? 1);
