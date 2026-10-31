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
// E1b 对比模式：--eval 跑 golden 三卷全量（准确率/时延/费用报告入 docs；92 题长窗）
const EVAL_MODE = process.argv.includes('--eval');
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

// ---------- E1b · golden 三卷评测（--eval：评测循环内联 runner，三闸门控照旧） ----------
async function runGoldenEval() {
  const VOLUMES = ['structured-json', 'business-zh', 'consumer-profile'];
  const DATASETS = path.join(ROOT, 'tests', 'eval-datasets');
  const graderPath = path.join(buildDir, 'tests', 'eval-datasets', 'grader.js');
  if (!fs.existsSync(graderPath)) {
    console.error('❌ 产物缺失：tests/eval-datasets/grader.js（判分器先自测在 CI 门禁）');
    cleanup(1);
  }
  const { grade } = await import(pathToFileURL(graderPath).href);

  // 端点守卫（SSRF 收窄）：https 放行；http 仅私有/回环网段 + 显式豁免
  let base = process.env.UAT_LLM_BASE_URL;
  if (base) {
    const parsed = new URL(base);
    const host = parsed.hostname;
    const privateCidr =
      host === 'localhost' || host === '127.0.0.1' || host.startsWith('10.') || host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && process.env.UAT_LLM_ALLOW_HTTP === '1' && privateCidr)) {
      console.error(`❌ UAT_LLM_BASE_URL 仅允许 https（http 需 UAT_LLM_ALLOW_HTTP=1 且私有网段；实际 ${parsed.protocol}//${host}）`);
      cleanup(1);
    }
  } else {
    base = 'https://open.bigmodel.cn/api/paas/v4';
  }
  const apiKeyEnv = process.env.UAT_LLM_API_KEY_ENV ?? 'ZHIPU_API_KEY';
  const key = process.env[apiKeyEnv]?.trim();
  if (!key) {
    console.error(`❌ ${apiKeyEnv} 缺失（三闸门控）`);
    cleanup(1);
  }
  const modelRaw = String(process.env.UAT_LLM_MODEL ?? 'glm-4-flash').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(modelRaw)) {
    console.error('❌ UAT_LLM_MODEL 含非法字符（白名单 [A-Za-z0-9._:-]）');
    cleanup(1);
  }

  // 极简 OpenAI 兼容调用（消费画像口径：≤1024 tok · 30s 超时 · 1 次重试）
  async function completeChat(prompt) {
    const body = JSON.stringify({
      model: modelRaw,
      messages: [
        { role: 'system', content: '你是 YYC³ 家族评测执行器。严格按题目要求作答：该输出 JSON 时只输出 JSON（无围栏无解释）；业务题按要点直接作答。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      max_tokens: 1024,
    });
    for (let attempt = 0; attempt <= 1; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        const res = await fetch(`${base.replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          body,
          signal: controller.signal,
        });
        if (res.ok) {
          const json = await res.json();
          const choice = json.choices?.[0]?.message ?? {};
          return {
            text: typeof choice.content === 'string' ? choice.content : '',
            promptTokens: json.usage?.prompt_tokens ?? 0,
            completionTokens: json.usage?.completion_tokens ?? 0,
          };
        }
        if (res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status}`);
      } catch (e) {
        if (attempt === 1) throw e instanceof Error ? e : new Error(String(e));
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error('unreachable');
  }

  const volumeStats = [];
  const caseRows = [];
  for (const volume of VOLUMES) {
    const vol = JSON.parse(fs.readFileSync(path.join(DATASETS, `${volume}.json`), 'utf8'));
    let passed = 0;
    let totalMs = 0;
    let tokens = 0;
    for (const testCase of vol.cases) {
      const startedAt = Date.now();
      let answer = '';
      let error = '';
      try {
        const out = await completeChat(testCase.prompt);
        answer = out.text;
        tokens += out.promptTokens + out.completionTokens;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      const durationMs = Date.now() - startedAt;
      totalMs += durationMs;
      const verdict = error ? { pass: false, detail: `调用失败：${error.slice(0, 120)}` } : grade(volume, answer, testCase);
      if (verdict.pass) passed += 1;
      caseRows.push({ id: testCase.id, volume, pass: verdict.pass, detail: verdict.detail, durationMs, answer: answer.slice(0, 160) });
      console.log(`  ${verdict.pass ? '✓' : '✗'} ${testCase.id}（${durationMs}ms）${verdict.pass ? '' : `——${verdict.detail}`}`);
    }
    volumeStats.push({
      volume, total: vol.cases.length, passed,
      accuracy: Number((passed / vol.cases.length).toFixed(3)),
      avgMs: Math.round(totalMs / vol.cases.length), tokens,
    });
  }
  const grandTotal = volumeStats.reduce((a, s) => a + s.total, 0);
  const grandPass = volumeStats.reduce((a, s) => a + s.passed, 0);
  const grandTokens = volumeStats.reduce((a, s) => a + s.tokens, 0);
  const grandMs = volumeStats.reduce((a, s) => a + s.avgMs * s.total, 0);

  let baseline = null;
  const baselinePath = process.env.UAT_LLM_EVAL_BASELINE;
  if (baselinePath && fs.existsSync(baselinePath)) {
    try {
      baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    } catch {
      baseline = null;
    }
  }
  const diffOf = (s) => {
    if (!baseline) return '';
    const before = (baseline.volumeStats ?? []).find((b) => b.volume === s.volume);
    return before ? `（基线 ${(before.accuracy * 100).toFixed(1)}% → 差 ${((s.accuracy - before.accuracy) * 100).toFixed(1)}pp）` : '';
  };

  const at = new Date().toISOString().slice(0, 10);
  const lines = [];
  lines.push(`# YYC³ golden 基线报告（${modelRaw} · ${at}）`);
  lines.push('');
  lines.push('> E1b 家族自测 SOP · 三闸门控实跑 · 判分器自测在档（golden-grader.contract · CI 门禁）');
  lines.push(`> 端点：${process.env.UAT_LLM_BASE_URL ? 'env 覆盖（UAT_LLM_BASE_URL）' : '缺省'} · 模型：${modelRaw}（env）· 消费画像：≤1024 tok · 30s`);
  lines.push('');
  lines.push('| 卷 | 题数 | 通过 | 准确率 | 平均时延 | tokens |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const s of volumeStats) lines.push(`| ${s.volume} | ${s.total} | ${s.passed} | ${(s.accuracy * 100).toFixed(1)}%${diffOf(s)} | ${s.avgMs}ms | ${s.tokens} |`);
  lines.push(`| **合计** | **${grandTotal}** | **${grandPass}** | **${((grandPass / grandTotal) * 100).toFixed(1)}%** | **${Math.round(grandMs / grandTotal)}ms** | **${grandTokens}** |`);
  lines.push('');
  lines.push('**候选模型上线前必跑本评测**（CONTRIBUTING · 装配指导在档）；下轮 diff：`UAT_LLM_EVAL_BASELINE=<本报告同名 json> pnpm uat:llm --eval`。');
  const reportBase = `YYC3-AI-Family-Agent-golden基线-${modelRaw}-${at}`;
  fs.writeFileSync(path.join(ROOT, 'docs', `${reportBase}.md`), `${lines.join('\n')}\n`);
  fs.writeFileSync(path.join(ROOT, 'docs', `${reportBase}.json`), `${JSON.stringify({ model: modelRaw, at, volumeStats, cases: caseRows }, null, 2)}\n`);
  console.log(`\n报告：docs/${reportBase}.md（+ 同名 .json 供 diff）`);
  console.log(`结果：${grandPass}/${grandTotal} 通过（${((grandPass / grandTotal) * 100).toFixed(1)}% · ${grandTokens} tokens）`);
}

if (EVAL_MODE) {
  console.log('▶ 运行 golden 三卷评测（真实端点，三闸门控 · E1b）…');
  runGoldenEval()
    .then(() => cleanup(0))
    .catch((e) => {
      console.error(`❌ golden 评测异常：${e instanceof Error ? e.message : String(e)}`);
      cleanup(1);
    });
} else {
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
}
