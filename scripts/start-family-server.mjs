#!/usr/bin/env node
/**
 * 家族服务启动器（start-family-server）—— P6-A（M14）· 部署侧 IO 装配。
 * 职责：装配配置 JSON（共享件 scripts/lib/family-server-config.mjs）经 stdin 首行注入
 *       隔离编译后的 family-server.entry（编译约定同 run-uat-llm：临时目录 tsconfig +
 *       别名 loader，不污染工作区）。
 * 用法：
 *   pnpm start               # 常驻服务：stdin 直通 MCP 行协议（host 帧），Ctrl+C 优雅停止
 *   pnpm start --selftest    # 自检：装载 + 抽样调用 + 指标摘录后 exit 0
 * 环境：YYC3_METRICS_PORT / YYC3_METRICS_HOST / YYC3_METRICS_TOKEN / YYC3_ADMISSION_MODE
 *       （observe|enforce，默认 observe）/ YYC3_KEEP_TMP=1 保留编译目录（调试）。
 */

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildFamilyServerConfig } from './lib/family-server-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'family-agents/family-server.entry.ts';
const selftest = process.argv.includes('--selftest');
const selftestLlm = process.argv.includes('--selftest:llm');

// ---------- 1. 配置装配（部署侧 IO 归共享件；entry 零文件 IO） ----------

const { config, llmEnvInject } = buildFamilyServerConfig(ROOT, { selftestLlm });

// ---------- 2. 隔离编译环境（与 run-regression / run-uat-llm 约定一致） ----------

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-server-'));
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
      include: [abs('architecture-kernel/**/*.ts'), abs('family-agents/**/*.ts')],
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

function cleanup(code) {
  if (process.env.YYC3_KEEP_TMP) {
    console.error(`🧷 临时目录保留（YYC3_KEEP_TMP=1）：${tmp}`);
  } else {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  process.exit(code);
}

// ---------- 3. 编译 + 运行 ----------

console.error(`⏳ 编译中（隔离临时环境；工具 ${config.tools.length} · 技能 ${config.manifestEntries.length}）…`);
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

const target = path.join(buildDir, ENTRY.replace(/\.ts$/, '.js'));
if (!fs.existsSync(target)) {
  console.error(`❌ 产物缺失：${ENTRY}`);
  cleanup(1);
}

const childArgs = [
  '--import',
  pathToFileURL(path.join(tmp, 'register.mjs')).href,
  target,
  ...(selftest || selftestLlm ? ['--selftest'] : []),
  ...(selftestLlm ? [`--llm-sample=${process.env.LLM_STEP_SAMPLE ?? 3}`] : []),
];

if (selftest || selftestLlm) {
  // 自检注入态：配置整段经 stdin 注入（entry 首行读取兼容 EOF——无换行亦收）
  console.error('▶ 家族服务自检（selftest）…');
  const r = spawnSync(process.execPath, childArgs, {
    cwd: ROOT,
    stdio: ['pipe', 'inherit', 'inherit'],
    input: JSON.stringify(config),
    env: { ...process.env, ...llmEnvInject },
    timeout: selftestLlm ? 540_000 : 120_000,
  });
  if (r.error) {
    console.error(`❌ 运行异常：${r.error.message}`);
    cleanup(1);
  }
  cleanup(r.status ?? 1);
}

// 常驻 host 形态（H5 修复）：stdin 首行注入配置 + 余量直通 MCP 帧 + 信号转发
console.error('▶ 启动家族服务（MCP stdio 常驻 · Ctrl+C 优雅停止）…');
const child = spawn(process.execPath, childArgs, {
  cwd: ROOT,
  stdio: ['pipe', 'inherit', 'inherit'],
  env: { ...process.env, ...llmEnvInject },
});
child.stdin.write(`${JSON.stringify(config)}\n`);
process.stdin.pipe(child.stdin);
process.once('SIGINT', () => child.kill('SIGINT'));
process.once('SIGTERM', () => child.kill('SIGTERM'));
child.on('exit', (code) => cleanup(code ?? 0));
