#!/usr/bin/env node
/**
 * 家族服务启动器（start-family-server）—— P6-A（M14）· 部署侧 IO 装配。
 * 职责：读取部署资产（assets/mcp-tools.json 工具目录 + presets/family-manifest.yaml
 *       技能清单）→ 组装配置 JSON 经 stdin 注入隔离编译后的 family-server.entry
 *       （编译约定同 run-uat-llm：临时目录 tsconfig + 别名 loader，不污染工作区）。
 * 用法：
 *   pnpm start               # 常驻服务：/metrics（默认 9464）+ MCP 处理器就绪，Ctrl+C 停止
 *   pnpm start --selftest    # 自检：装载 + 抽样调用 + 指标摘录后 exit 0
 * 环境：YYC3_METRICS_PORT / YYC3_METRICS_HOST / YYC3_METRICS_TOKEN / YYC3_ADMISSION_MODE
 *       （observe|enforce，默认 observe）/ YYC3_KEEP_TMP=1 保留编译目录（调试）。
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseYaml } from './lib/yaml-lite.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'family-agents/family-server.entry.ts';
const selftest = process.argv.includes('--selftest');

// ---------- 1. 部署资产读取（IO 归本脚本；entry 零文件 IO） ----------

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/mcp-tools.json'), 'utf8'));
const manifest = parseYaml(fs.readFileSync(path.join(ROOT, 'presets/family-manifest.yaml'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

if (!Array.isArray(catalog.tools) || catalog.tools.length === 0) throw new Error('工具目录为空：assets/mcp-tools.json');
if (!Array.isArray(manifest.skills) || manifest.skills.length === 0) throw new Error('技能清单为空：presets/family-manifest.yaml');

const config = {
  serverInfo: { name: 'yyc3-family', version: pkg.version },
  tools: catalog.tools,
  manifestEntries: manifest.skills,
  admission: {
    allowed: ['family-core'],
    mode: process.env.YYC3_ADMISSION_MODE === 'enforce' ? 'enforce' : 'observe',
  },
  metricsServer: {
    port: Number(process.env.YYC3_METRICS_PORT ?? 9464),
    host: process.env.YYC3_METRICS_HOST ?? '127.0.0.1',
    ...(process.env.YYC3_METRICS_TOKEN ? { authToken: process.env.YYC3_METRICS_TOKEN } : {}),
  },
};

// 外部家人 A2A 编排（M22）：存在实例契约即自动装配（端点/能力/令牌环境变量）
try {
  const inst = parseYaml(fs.readFileSync(path.join(ROOT, 'presets/external-worker/blueprint-13.worker.yaml'), 'utf8'));
  if (inst?.worker?.endpoint) {
    config.external = {
      endpoint: inst.worker.endpoint,
      ...(inst.worker.auth?.token_env ? { tokenEnv: inst.worker.auth.token_env } : {}),
      ...(inst.worker.timeout_ms ? { timeoutMs: inst.worker.timeout_ms } : {}),
      ...(Array.isArray(inst.worker.capabilities) ? { skills: inst.worker.capabilities } : {}),
    };
    console.log(`ⓔ 外部家人编排：${inst.worker.id ?? 'external'} @ ${inst.worker.endpoint}（实例契约自动装配）`);
  }
} catch { /* 无实例：外部编排保持关闭 */ }

// LLM 语义执行臂（M16）三闸门控（同 uat:llm 范式）：缺一保持确定性臂。
// --selftest:llm（M17）额外要求三闸 + 密钥齐备（env 或 .env），否则跳过 LLM 采样 exit 0。
const llmKeyEnv = process.env.ZHIPU_API_KEY?.trim() ? 'ZHIPU_API_KEY' : process.env.OPENAI_API_KEY?.trim() ? 'OPENAI_API_KEY' : null;
const llmEnvInject = {};
let llmKeyed = Boolean(llmKeyEnv);
if (!llmKeyed) {
  // .env 兜底解析（只透传给子进程，不打印值）
  try {
    const dotenv = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    const m = dotenv.match(/^(ZHIPU_API_KEY|OPENAI_API_KEY)=(.+)$/m);
    if (m && m[2].trim()) {
      llmKeyed = true;
      llmEnvInject[m[1]] = m[2].trim();
    }
  } catch { /* 无 .env */ }
}
const selftestLlm = process.argv.includes('--selftest:llm');
const llmGated = process.env.LLM_STEP === '1' && process.env.LLM_STEP_CONFIRM === '我知晓真实计费' && llmKeyed;
if (llmGated) {
  const provider = llmKeyEnv === 'OPENAI_API_KEY' || (!llmKeyEnv && Object.keys(llmEnvInject)[0] === 'OPENAI_API_KEY') ? 'openai' : 'zhipu';
  config.llm = {
    provider,
    ...(process.env.LLM_STEP_MODEL ? { model: process.env.LLM_STEP_MODEL } : {}),
    ...(process.env.LLM_STEP_BASE_URL ? { baseUrl: process.env.LLM_STEP_BASE_URL } : {}),
  };
  console.log('ⓔ LLM 语义执行臂：三闸放行，已启用（真实计费调用）');
} else if (selftestLlm) {
  console.log('ⓔ LLM 自检：三闸不全（需 LLM_STEP=1 + LLM_STEP_CONFIRM=我知晓真实计费 + API Key），跳过 LLM 采样');
} else if (process.env.LLM_STEP === '1') {
  console.log('ⓔ LLM 语义执行臂：三闸不全，保持确定性臂');
}

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
    console.log(`🧷 临时目录保留（YYC3_KEEP_TMP=1）：${tmp}`);
  } else {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  process.exit(code);
}

// ---------- 3. 编译 + 运行 ----------

console.log(`⏳ 编译中（隔离临时环境；工具 ${catalog.tools.length} · 技能 ${manifest.skills.length}）…`);
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

console.log(selftest || selftestLlm ? '▶ 家族服务自检（selftest）…' : '▶ 启动家族服务（Ctrl+C 优雅停止）…');
const childArgs = [
  '--import',
  pathToFileURL(path.join(tmp, 'register.mjs')).href,
  target,
  ...(selftest || selftestLlm ? ['--selftest'] : []),
  ...(selftestLlm ? [`--llm-sample=${process.env.LLM_STEP_SAMPLE ?? 3}`] : []),
];
const r = spawnSync(process.execPath, childArgs, {
  cwd: ROOT,
  stdio: ['pipe', 'inherit', 'inherit'],
  input: JSON.stringify(config),
  env: { ...process.env, ...llmEnvInject },
  timeout: selftestLlm ? 540_000 : selftest ? 120_000 : undefined,
});
if (r.error) {
  console.error(`❌ 运行异常：${r.error.message}`);
  cleanup(1);
}
cleanup(r.status ?? 1);
