#!/usr/bin/env node
/**
 * YYC³ AI Family · 全量回归门禁 + 五支柱 Dashboard 一体化脚本（零依赖，node >= 20）。
 *
 * 职责（CI 门禁固化为单命令，Phase E 验收「五支柱 Dashboard 全绿」的可视化面）：
 *   1. 在临时目录生成隔离编译环境（tsconfig / 别名解析 loader / register），tsc 增量产物；
 *   2. 逐个运行 tests/ 全部 spec（零依赖 harness，node --import register）；
 *   3. 解析「结果：N 通过 / M 失败 / 共 K 例」，按五支柱（自·知·学·治·愈）聚合；
 *   4. 生成 ops/observability/pillar-dashboard/{data.json, index.html}（自包含，file:// 直开）；
 *   5. 门禁判定：任一用例失败或 spec 异常退出 → exit 1（防退化红线）。
 *
 * 用法：
 *   pnpm regression            # 门禁 + 面板
 *   node scripts/run-regression.mjs --dashboard-only   # 只生成面板（跳过门禁 exit code）
 *   YYC3_KEEP_TMP=1 node ...   # 调试：保留临时编译目录（路径见输出）
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { countCapabilitySupply } from './lib/capability-supply.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 回归清单与五支柱映射（spec → pillars；five: 自/知/学/治/愈）。 */
const SPECS = [
  { file: 'tests/unit/procedural-extraction.spec.js', pillars: ['知'], phase: 'Phase A', name: '程序化记忆提取' },
  { file: 'tests/unit/self-judge-kit.spec.js', pillars: ['自'], phase: 'Phase A', name: '自判断套件' },
  { file: 'tests/integration/self-judge-verification.spec.js', pillars: ['自', '治'], phase: 'Phase B', name: '自评-外验闭环' },
  { file: 'tests/integration/experience-reflow.spec.js', pillars: ['学'], phase: 'Phase C', name: '经验回流闭环' },
  { file: 'tests/integration/pillars-smoke.spec.js', pillars: ['自', '治', '学'], phase: '冒烟', name: '三支柱贯通冒烟' },
  { file: 'tests/integration/family-bus.spec.js', pillars: ['愈'], phase: 'infra', name: '家族通信总线（含 DLQ）' },
  { file: 'tests/integration/infra-integration.spec.js', pillars: ['学', '愈'], phase: 'infra 1–4', name: 'infra 集成位' },
  { file: 'tests/integration/healing-governance.spec.js', pillars: ['治', '愈', '知'], phase: 'Phase D', name: '治/愈 + 记忆全链路' },
  { file: 'tests/integration/knowledge-evolution.spec.js', pillars: ['知', '学'], phase: 'Phase E', name: '知识更新 + 参数护栏' },
  { file: 'tests/integration/assembly-e2e.spec.js', pillars: ['学', '愈'], phase: '装配', name: '装配层端到端（infra 1–4）' },
  { file: 'tests/integration/metrics-observability.spec.js', pillars: ['学', '愈'], phase: 'P0 数据面', name: '指标采集与暴露' },
  { file: 'tests/integration/five-dimension-metrics.spec.js', pillars: ['治'], phase: 'P1-T4', name: '五维指标映射' },
  { file: 'tests/integration/collaboration-wiring.spec.js', pillars: ['自', '学', '治'], phase: 'P1-T4b', name: '协同度生产接线' },
  { file: 'tests/integration/llm-provider.spec.js', pillars: ['学'], phase: 'P1', name: 'LLM Provider（zhipu）' },
  { file: 'tests/integration/mcp-adapter.spec.js', pillars: ['治', '愈'], phase: 'P1-T3', name: 'MCP 适配层（codec + stdio）' },
  { file: 'tests/integration/mcp-server.spec.js', pillars: ['治', '愈'], phase: 'P3-MCP', name: 'MCP 服务端协议语义' },
  { file: 'tests/integration/skill-id-unification.spec.js', pillars: ['知', '学'], phase: 'P3-T3', name: '统一技能 id 与加载器' },
  { file: 'tests/integration/skill-progressive-disclosure.spec.js', pillars: ['知', '学'], phase: 'P3-T4', name: '渐进披露检索' },
  { file: 'tests/skills/skill-behavior-eval.spec.js', pillars: ['知', '学'], phase: 'P3-T5', name: '技能行为评测（observe）' },
  { file: 'tests/e2e/qianhang-intent-e2e.spec.js', pillars: ['自', '学'], phase: 'e2e', name: '千行意图端到端' },
  // UAT（tests/uat/llm-live-uat.spec.ts）刻意不进本清单：密钥类真实调用只走 `pnpm uat:llm` 本地门控，
  // 保持回归门禁 hermetic 与「跳过 0」口径。
  { file: 'tests/pillar-contracts/pillars.contract.js', pillars: [], phase: '契约', name: '五支柱契约' },
  { file: 'tests/contracts/manifest.contract.js', pillars: [], phase: '契约 P1-T1', name: '家族契约清单' },
  { file: 'tests/contracts/agent-card.contract.js', pillars: [], phase: '契约 P1-T2', name: 'Agent Card' },
  { file: 'tests/contracts/prompt.contract.js', pillars: [], phase: '契约 P1-T5', name: '提示词契约' },
  { file: 'tests/contracts/skill-artifacts.contract.js', pillars: [], phase: '契约 P3-T2', name: '技能产物契约' },
  { file: 'tests/contracts/capability-supply.contract.js', pillars: [], phase: '契约 P3-T6', name: '能力供给契约' },
  { file: 'tests/contracts/plugin-format.contract.js', pillars: [], phase: '契约 P4-T1', name: '能力包格式契约' },
  { file: 'tests/integration/capability-catalog.spec.js', pillars: ['治'], phase: 'P4-T2/T4', name: '静态注册中心与完整性' },
  { file: 'tests/integration/capability-allowlist.spec.js', pillars: ['治'], phase: 'P4-T3', name: '准入治理（observe/enforce）' },
  { file: 'tests/contracts/mcp-tools.contract.js', pillars: [], phase: '契约 P4-T5', name: 'MCP 工具目录契约' },
  { file: 'tests/integration/mcp-tool-catalog.spec.js', pillars: ['治'], phase: 'P4-T5', name: 'MCP 工具目录与分派' },
  { file: 'tests/contracts/pack-plugins.contract.js', pillars: [], phase: '契约 P4-T6', name: '能力包打包 CLI 契约' },
  { file: 'tests/integration/plugin-pack.spec.js', pillars: ['治'], phase: 'P4-T6', name: '打包分发注册闭环' },
  { file: 'tests/contracts/external-worker.contract.js', pillars: [], phase: '契约 P2-T1', name: '外部 Worker 契约' },
  { file: 'tests/integration/a2a-adapter.spec.js', pillars: ['治'], phase: 'P2-T2', name: 'A2A 适配层（发现+委托+DLQ）' },
  { file: 'tests/integration/security-policy-bind.spec.js', pillars: ['治'], phase: 'P2-T4', name: '安全策略映射（observe/enforce）' },
  { file: 'tests/integration/capability-instrumentation.spec.js', pillars: ['治'], phase: '§6.3 接线', name: '能力供给生产接线' },
  { file: 'tests/integration/family-server-assembly.spec.js', pillars: ['治'], phase: 'P6-A', name: '家族服务装配（MCP+准入+仪表）' },
  { file: 'tests/integration/skill-executor.spec.js', pillars: ['学'], phase: 'P6-B', name: '技能执行引擎（确定性臂）' },
  { file: 'tests/integration/llm-step-executor.spec.js', pillars: ['学'], phase: 'P6-C', name: 'LLM 技能步骤执行（语义臂）' },
  { file: 'tests/integration/learning-scheduler.spec.js', pillars: ['学'], phase: 'P8-a', name: '学习调度器（配额+队列）' },
  { file: 'tests/integration/learning-scheduler-assembly.spec.js', pillars: ['学', '愈'], phase: 'P8-b', name: '学习调度装配（周期配额闸）' },
  { file: 'tests/integration/skill-lifecycle.spec.js', pillars: ['学'], phase: 'P8-a', name: '技能生命周期（固化/淘汰/退化）' },
  { file: 'tests/integration/family-ops.spec.js', pillars: ['治'], phase: 'P8-a', name: '家族编排套件（编排/态势/通讯/基建自愈）' },
  // UAT（tests/uat/external-worker-uat.spec.ts）刻意不进本清单（P2-T3）：真实外部端点调用
  // 只走 `pnpm uat:external` 三闸门控，保持回归门禁 hermetic 与「跳过 0」口径。
];

const FIVE = ['自', '知', '学', '治', '愈'];
const FIVE_LABEL = { 自: '自 · 自判断', 知: '知 · 记忆', 学: '学 · 持续学习', 治: '治 · 治理', 愈: '愈 · 自愈' };
const DASHBOARD_DIR = path.join(ROOT, 'ops', 'observability', 'pillar-dashboard');
const FIVE_DIM_MAP = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'assets', 'schemas', 'five-dimension-map.json'), 'utf8'),
);

// ---------- 1. 隔离编译环境 ----------

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-regression-'));
const buildDir = path.join(tmp, 'build');

const abs = (p) => path.join(ROOT, p);
const tsconfig = {
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
  include: [
    abs('architecture-kernel/**/*.ts'),
    abs('family-agents/**/*.ts'),
    abs('tests/**/*.ts'),
  ],
  exclude: [abs('node_modules'), abs('dist'), abs('family-agents/**/tests/**'), '**/*.tpl'],
};

fs.writeFileSync(path.join(tmp, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

// 别名解析钩子：@shared/@members → 产物树；目录桶补 /index.js；无扩展名补 .js
fs.writeFileSync(
  path.join(tmp, 'loader.mjs'),
  `import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

// ---------- 2. 编译 ----------

function resolveTsc() {
  const local = path.join(ROOT, 'node_modules', '.bin', 'tsc');
  if (fs.existsSync(local)) return local;
  return 'tsc'; // 本地全局安装兜底
}

console.log('⏳ 编译中（隔离临时环境）…');
try {
  execFileSync(resolveTsc(), ['-p', path.join(tmp, 'tsconfig.json')], { stdio: 'inherit', cwd: ROOT });
} catch {
  console.error('❌ 编译失败（tsc 非零退出）');
  cleanup(1);
}

// ---------- 3. 逐 spec 运行 + 解析 ----------

function runSpec(spec) {
  const target = path.join(buildDir, spec.file);
  if (!fs.existsSync(target)) {
    return { exitCode: 1, stdout: '', error: `产物缺失：${spec.file}` };
  }
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(tmp, 'register.mjs')).href, target], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120_000,
  });
  return { exitCode: r.status ?? 1, stdout: r.stdout ?? '', error: r.stderr?.split('\n').slice(-4).join('\n') };
}

function parseResult(stdout, exitCode) {
  const m = stdout.match(/结果：(\d+) 通过 \/ (\d+) 失败(?:\s*\/\s*(\d+) 跳过)? \/ 共 (\d+) 例/);
  if (m) {
    return {
      passed: Number(m[1]),
      failed: Number(m[2]),
      skipped: Number(m[3] ?? 0),
      total: Number(m[4]),
      silent: false,
    };
  }
  // 静默 spec（无 harness 汇总行）：exit 0 视为通过，无用例计数
  return { passed: 0, failed: exitCode === 0 ? 0 : 1, skipped: 0, total: 0, silent: true };
}

const results = [];
for (const spec of SPECS) {
  process.stdout.write(`▶ ${spec.file} … `);
  const run = runSpec(spec);
  const parsed = parseResult(run.stdout, run.exitCode);
  const ok = run.exitCode === 0 && parsed.failed === 0;
  results.push({ ...spec, ...parsed, ok, exitCode: run.exitCode });
  const label = parsed.silent
    ? 'OK（静默，exit 0）'
    : `OK（${parsed.passed}/${parsed.total}${parsed.skipped > 0 ? `，跳过 ${parsed.skipped}` : ''}）`;
  console.log(ok ? label : `FAIL（exit ${run.exitCode}）`);
  if (!ok) {
    console.log(run.stdout.split('\n').filter((l) => l.startsWith('FAIL') || l.startsWith('      ')).join('\n'));
    if (run.error && !run.stdout) console.log(run.error);
  }
}

// ---------- 4. 五支柱聚合 + 面板生成 ----------

const pillarStats = Object.fromEntries(FIVE.map((p) => [p, { passed: 0, failed: 0 }]));
for (const r of results) {
  for (const p of r.pillars) {
    pillarStats[p].passed += r.passed;
    pillarStats[p].failed += r.failed + (r.silent && !r.ok ? 1 : 0);
  }
}

const totalPassed = results.reduce((s, r) => s + r.passed, 0);
const totalFailed = results.reduce((s, r) => s + r.failed, 0);
const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);
const gatePassed = results.every((r) => r.ok);

const now = new Date();
const stamp = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(now);

// 能力供给三元组（P3-T6）：技能 / MCP 工具 / 插件，来源 scripts/lib/capability-supply.mjs（单一事实源）
const supply = countCapabilitySupply(ROOT);

const data = {
  schema: 'yyc3.pillar-dashboard/v1',
  generatedAt: now.toISOString(),
  generatedAtCN: stamp,
  gate: { passed: gatePassed, totalPassed, totalFailed, totalSkipped, specs: results.length },
  capabilities: { skills: supply.skills, activeSkills: supply.activeSkills, tools: supply.tools, plugins: supply.plugins },
  pillars: FIVE.map((p) => ({ id: p, label: FIVE_LABEL[p], green: pillarStats[p].failed === 0, ...pillarStats[p] })),
  dimensions: FIVE_DIM_MAP.dimensions.map((d) => ({ id: d.id, label: d.label, focus: d.focus, metrics: d.metrics.length })),
  collaboration: FIVE_DIM_MAP.collaboration.metrics.map((m) => ({ name: m.name, dimension: m.dimension })),
  specs: results.map((r) => ({
    file: r.file, name: r.name, phase: r.phase, pillars: r.pillars,
    passed: r.passed, failed: r.failed, skipped: r.skipped, total: r.total, silent: r.silent, ok: r.ok,
  })),
};

fs.mkdirSync(DASHBOARD_DIR, { recursive: true });
fs.writeFileSync(path.join(DASHBOARD_DIR, 'data.json'), JSON.stringify(data, null, 2));

// CI 侧指标（v2.7.0 P0 数据面）：供 Prometheus textfile / Pushgateway 采集，
// 消费方为 prometheus-rules.yaml 的 RegressionGateFailed 与 FivePillarDashboardRed。
const PILLAR_PROM = { 自: 'self', 知: 'memory', 学: 'learning', 治: 'governance', 愈: 'healing' };
const prom = [
  '# HELP family_regression_gate_failed_total 全量回归门禁失败用例数（CI）',
  '# TYPE family_regression_gate_failed_total gauge',
  `family_regression_gate_failed_total ${totalFailed}`,
  '',
  '# HELP family_pillar_failed_cases 五支柱失败用例数（CI）',
  '# TYPE family_pillar_failed_cases gauge',
  ...data.pillars.map((p) => `family_pillar_failed_cases{pillar="${PILLAR_PROM[p.id]}"} ${p.failed}`),
  '',
  '# HELP family_regression_spec_passed 回归套件通过用例数（CI）',
  '# TYPE family_regression_spec_passed gauge',
  ...data.specs.map((s) => `family_regression_spec_passed{spec="${s.file}"} ${s.passed}`),
  '',
];
fs.writeFileSync(path.join(DASHBOARD_DIR, 'metrics.prom'), prom.join('\n'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pillarCards = data.pillars
  .map(
    (p) => `<div class="card ${p.green ? 'green' : 'red'}">
      <div class="pill">${esc(p.id)}</div>
      <div class="label">${esc(p.label)}</div>
      <div class="num">${p.failed === 0 ? '全绿' : `${p.failed} 失败`}</div>
      <div class="sub">${p.passed} 例通过</div>
    </div>`,
  )
  .join('\n');
const dimensionCards = data.dimensions
  .map(
    (d) => `<div class="card dim">
      <div class="pill">${esc(d.label)}</div>
      <div class="label">${esc(d.focus)}</div>
      <div class="num">${d.metrics} 项指标</div>
      <div class="sub">${esc(d.id)}</div>
    </div>`,
  )
  .join('\n');
const specRows = data.specs
  .map(
    (s) => `<tr class="${s.ok ? 'ok' : 'bad'}">
      <td>${esc(s.phase)}</td><td>${esc(s.name)}</td>
      <td><code>${esc(s.file)}</code></td>
      <td>${s.pillars.map(esc).join(' · ') || '—'}</td>
      <td>${s.silent ? '静默' : `${s.passed}/${s.total}${s.skipped > 0 ? `（跳过 ${s.skipped}）` : ''}`}</td>
      <td>${s.ok ? '✅' : '❌'}</td>
    </tr>`,
  )
  .join('\n');
const cap = data.capabilities;
const capabilityCards = [
  { pill: '技能', num: cap.skills, sub: `active ${cap.activeSkills} · planned ${cap.skills - cap.activeSkills}` },
  { pill: '工具', num: cap.tools, sub: 'MCP tools/list 可见（active 映射）' },
  { pill: '插件', num: cap.plugins, sub: '能力包 plugins/{id}（P4 预留）' },
]
  .map(
    (c) => `<div class="card dim">
      <div class="pill">${esc(c.pill)}</div>
      <div class="num">${c.num}</div>
      <div class="sub">${esc(c.sub)}</div>
    </div>`,
  )
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>YYC³ 五支柱 Dashboard · 回归门禁</title>
<style>
  :root { --bg:#0d1117; --panel:#161b22; --line:#30363d; --fg:#e6edf3; --dim:#8b949e;
    --green:#3fb950; --red:#f85149; --gold:#d29922; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--fg); font: 14px/1.6 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; padding: 32px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .meta { color: var(--dim); font-size: 12px; margin-bottom: 24px; }
  .gate { display: inline-block; padding: 4px 14px; border-radius: 999px; font-weight: 600; margin-bottom: 24px; }
  .gate.pass { background: rgba(63,185,80,.15); color: var(--green); border: 1px solid var(--green); }
  .gate.fail { background: rgba(248,81,73,.15); color: var(--red); border: 1px solid var(--red); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 28px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 16px; }
  .card.green { border-color: var(--green); }
  .card.red { border-color: var(--red); }
  .pill { display: inline-block; font-size: 18px; font-weight: 700; margin-bottom: 6px; }
  .card.green .pill { color: var(--green); } .card.red .pill { color: var(--red); }
  .card.dim .pill { color: var(--gold); font-size: 15px; }
  h2.section { font-size: 15px; margin: 4px 0 12px; color: var(--dim); font-weight: 600; }
  .label { color: var(--dim); font-size: 12px; }
  .num { font-size: 16px; font-weight: 600; margin-top: 8px; }
  .sub { color: var(--dim); font-size: 12px; }
  table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--line); font-size: 13px; }
  th { background: #1c2129; color: var(--dim); font-weight: 500; }
  tr.ok td:last-child { color: var(--green); } tr.bad td:last-child { color: var(--red); }
  code { font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: var(--dim); }
  .footer { margin-top: 24px; color: var(--dim); font-size: 12px; }
  .footer b { color: var(--gold); }
</style>
</head>
<body>
  <h1>YYC³ AI Family · 五支柱 Dashboard</h1>
  <div class="meta">生成时间（Asia/Shanghai）：${esc(data.generatedAtCN)} ｜ 五维驱动 · 五高五标五化</div>
  <div class="gate ${gatePassed ? 'pass' : 'fail'}">${gatePassed ? `门禁通过 · ${totalPassed} 例全绿` : `门禁失败 · ${totalFailed} 例失败`}</div>
  <div class="grid">${pillarCards}</div>
  <h2 class="section">能力供给（P3-T6 · 技能 / 工具 / 插件）</h2>
  <div class="grid">${capabilityCards}</div>
  <h2 class="section">五维覆盖（P1-T4 · 时间 / 空间 / 属性 / 事件 / 关联）</h2>
  <div class="grid">${dimensionCards}</div>
  <table>
    <thead><tr><th>阶段</th><th>套件</th><th>文件</th><th>支柱</th><th>通过</th><th>状态</th></tr></thead>
    <tbody>${specRows}</tbody>
  </table>
  <div class="footer">YYC³ · 言启象限 ｜ 语枢未来 ｜ <b>万象归元于云枢 · 深栈智启新纪元</b> ｜ 数据源 ops/observability/pillar-dashboard/data.json</div>
</body>
</html>`;

fs.writeFileSync(path.join(DASHBOARD_DIR, 'index.html'), html.replace('</body>', `<script>const DATA=${JSON.stringify(data).replace(/</g, '\\u003c')};console.log('YYC³ pillar-dashboard', DATA.gate);</script></body>`));

// ---------- 5. 汇总 + 门禁判定 ----------

console.log('\n===== 五支柱汇总 =====');
for (const p of data.pillars) console.log(`${p.green ? '🟢' : '🔴'} ${p.label}：${p.passed} 例通过${p.failed ? `，${p.failed} 失败` : ''}`);
console.log(`\n五维覆盖：${data.dimensions.map((d) => `${d.label} ${d.metrics} 项`).join(' · ')}`);
console.log(`能力供给：技能 ${cap.skills}（active ${cap.activeSkills}）· 工具 ${cap.tools} · 插件 ${cap.plugins}`);
console.log(`\n静默 spec（exit 0 无用例计数）：${results.filter((r) => r.silent && r.ok).map((r) => r.file).join(', ') || '无'}`);
console.log(`显式跳过用例：${totalSkipped} 例（原因见各 spec 输出与面板）`);
console.log(`面板已生成：${path.join(DASHBOARD_DIR, 'index.html')}（file:// 直开）`);
console.log(`门禁判定：${gatePassed ? `✅ 通过（${totalPassed} 例全绿）` : '❌ 失败'}`);

function cleanup(code) {
  if (process.env.YYC3_KEEP_TMP) {
    console.log(`🧷 临时目录保留（YYC3_KEEP_TMP=1）：${tmp}`);
  } else {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  process.exit(code);
}

if (process.argv.includes('--dashboard-only')) {
  console.log('（--dashboard-only：跳过门禁 exit code）');
  cleanup(0);
}
cleanup(gatePassed ? 0 : 1);
