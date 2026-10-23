#!/usr/bin/env node
/**
 * LLM 实答 UAT 运行器（run-uat-llm）—— 身份与意图抽检（本地门控，默认跳过）。
 *
 * 与 scripts/run-regression.mjs 的隔离编译约定一致（临时目录 tsconfig +
 * 别名解析 loader/register），但只运行 tests/uat/llm-live-uat.spec：
 *   - 不进入 CI 回归清单（SPECS），无真实 Key 时整体跳过、exit 0；
 *   - 打真实开放平台，产生真实计费，须显式 UAT_LLM=1 + UAT_LLM_CONFIRM。
 *
 * 用法：
 *   UAT_LLM=1 UAT_LLM_CONFIRM=我知晓真实计费 ZHIPU_API_KEY=<key> pnpm uat:llm
 *   可选：UAT_LLM_PROVIDER / UAT_LLM_BASE_URL / UAT_LLM_MODEL / UAT_LLM_API_KEY_ENV
 *   YYC3_KEEP_TMP=1 保留临时编译目录（调试）。
 *
 * 安全：本脚本不读取密钥值、不打印密钥（只输出变量名与是否存在）。
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = 'tests/uat/llm-live-uat.spec.ts';

// ---------- 预检诊断（非敏感值） ----------

const apiKeyEnv = process.env.UAT_LLM_API_KEY_ENV ?? (process.env.UAT_LLM_PROVIDER === 'openai' ? 'OPENAI_API_KEY' : 'ZHIPU_API_KEY');
const keyValue = process.env[apiKeyEnv];
console.log('ⓔ UAT 预检（不回显密钥值）：');
console.log(`   UAT_LLM=${process.env.UAT_LLM ?? '（未设置）'}  UAT_LLM_CONFIRM=${process.env.UAT_LLM_CONFIRM ?? '（未设置）'}`);
console.log(`   provider=${process.env.UAT_LLM_PROVIDER ?? 'zhipu（默认）'}  model=${process.env.UAT_LLM_MODEL ?? '（默认）'}  base=${process.env.UAT_LLM_BASE_URL ?? '（默认）'}`);
console.log(`   ${apiKeyEnv}：${keyValue?.trim() ? `存在（长度 ${keyValue.trim().length}）` : '缺失'}`);

// ---------- 隔离编译环境（与 run-regression.mjs 约定一致） ----------

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-uat-'));
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

console.log('▶ 运行 LLM 实答 UAT（真实开放平台，受门控保护）…');
const r = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(tmp, 'register.mjs')).href, target], {
  cwd: ROOT,
  stdio: 'inherit',
  timeout: 300_000,
});
if (r.error) {
  console.error(`❌ 运行异常：${r.error.message}`);
  cleanup(1);
}
cleanup(r.status ?? 1);
