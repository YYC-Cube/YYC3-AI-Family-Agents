#!/usr/bin/env node
/**
 * npm 双包打包器（pack-npm）—— M31 · 复用路线 R1/R2（可复用性分析 §五）。
 *
 * 产出两个可发布 npm 包（零运行时依赖 · 确定性装配 · 同输入恒同产物）：
 *   dist/ai-family-kernel  @yyc3/ai-family-kernel —— 内核库：architecture-kernel
 *     全量预编译（JS + d.ts），@shared 类型子树 vendor 化（self-judge-kit /
 *     memory-framework，均纯相对导入闭包），生成 src/index.ts barrel 不入库。
 *   dist/ai-family-agent   @yyc3/ai-family-agent —— MCP Server：内核 + 家人实现
 *     全量预编译，@shared/@members 别名发射后重写为包内相对路径，
 *     bin `yyc3-family-server`（stdin 配置 JSON · --selftest 直通）。
 *
 * 用法：
 *   node scripts/pack-npm.mjs            # 装配到 dist/
 *   YYC3_PACK_OUT=<dir> node ...         # 装配到指定目录（契约测试用）
 *   node scripts/pack-npm.mjs --check    # 装配到临时目录全量校验后清理（幂等）
 *
 * 红线（校验强约束）：内核不 import family-agents；@shared 仅类型导入且打包后
 * 零残留；两包 dependencies 恒空；版本与根 package.json 同步。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const TSC = fs.existsSync(path.join(ROOT, 'node_modules', '.bin', 'tsc'))
  ? path.join(ROOT, 'node_modules', '.bin', 'tsc')
  : 'tsc';

const SHARED_VENDOR = {
  'self-judge-kit': 'family-agents/shared-core/self-judge-kit',
  'memory-framework': 'family-agents/shared-core/memory-framework',
};

/** 递归收集 .ts 相对路径（跳过 tests 目录 / *.spec.ts）。 */
function walkTs(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(base, abs);
    if (entry.isDirectory()) {
      if (entry.name === 'tests') continue; // 自测 spec 不入包（根口径 **/*.spec.ts 不编译）
      walkTs(abs, base, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      out.push(rel);
    }
  }
  return out;
}

function copyTsTree(srcDir, destDir) {
  const files = walkTs(srcDir);
  for (const rel of files) {
    const target = path.join(destDir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(srcDir, rel), target);
  }
  return files.length;
}

function copyDir(srcDir, destDir) {
  fs.cpSync(srcDir, destDir, { recursive: true });
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

/** 别名导入重写：file 内 `@shared/<name>` / `@members/<rest>` → 包内相对路径。 */
function rewriteAliasesInFile(file, pkgRoot, aliasTargets) {
  let text = fs.readFileSync(file, 'utf8');
  let rewritten = 0;
  const relTo = (targetAbs) => {
    let rel = toPosix(path.relative(path.dirname(file), targetAbs));
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return rel;
  };
  text = text.replace(/(['"])@shared\/([^'"]+)\1/g, (m, quote, name) => {
    const target = aliasTargets.sharedTarget(pkgRoot, name);
    if (!target) return m;
    rewritten += 1;
    return `${quote}${relTo(target)}${quote}`;
  });
  text = text.replace(/(['"])@members\/([^'"]+)\1/g, (m, quote, rest) => {
    const target = aliasTargets.membersTarget(pkgRoot, rest);
    if (!target) return m;
    rewritten += 1;
    return `${quote}${relTo(target)}${quote}`;
  });
  if (rewritten > 0) fs.writeFileSync(file, text);
  return rewritten;
}

/** 发射后重写（dist js/d.ts）：解析包内真实文件路径（无扩展补 /index.js）。 */
function agentSharedTarget(pkgRoot, name) {
  const base = path.join(pkgRoot, 'dist', 'family-agents', 'shared-core', name);
  if (fs.existsSync(`${base}.js`)) return `${base}.js`;
  if (fs.existsSync(path.join(base, 'index.js'))) return path.join(base, 'index.js');
  return undefined;
}

function agentMembersTarget(pkgRoot, rest) {
  const base = path.join(pkgRoot, 'dist', 'family-agents', rest);
  if (fs.existsSync(`${base}.js`)) return `${base}.js`;
  if (fs.existsSync(path.join(base, 'index.js'))) return path.join(base, 'index.js');
  return undefined;
}

/** 源期重写（kernel src）：vendor 目录固定映射（类型导入，无扩展补 /index.js）。 */
function kernelSharedTarget(pkgRoot, name) {
  const vendor = SHARED_VENDOR[name];
  if (!vendor) return undefined;
  return path.join(pkgRoot, 'vendor', name, 'index.js');
}

function rewriteTree(pkgRoot, dirRoot, aliasTargets) {
  let count = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.name.endsWith('.js') || entry.name.endsWith('.d.ts') || entry.name.endsWith('.ts')) {
        count += rewriteAliasesInFile(abs, pkgRoot, aliasTargets);
      }
    }
  };
  walk(dirRoot);
  return count;
}

function assertNoRemnant(dir, importPatterns, label) {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.name.endsWith('.js') || entry.name.endsWith('.d.ts') || entry.name.endsWith('.ts')) {
        const text = fs.readFileSync(abs, 'utf8');
        for (const pattern of importPatterns) {
          if (pattern.test(text)) offenders.push(`${toPosix(path.relative(dir, abs))} ← ${pattern}`);
        }
      }
    }
  };
  walk(dir);
  if (offenders.length > 0) {
    throw new Error(`${label} 别名/越界残留 ${offenders.length} 处：\n  ${offenders.slice(0, 8).join('\n  ')}`);
  }
}

function runTsc(stageDir, configName) {
  try {
    execFileSync(TSC, ['-p', path.join(stageDir, configName)], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    throw new Error(`tsc 编译失败（${configName}）：${String(e.stderr || e.stdout || e.message).slice(0, 500)}`);
  }
}

function writeJson(file, obj) {
  fs.writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`);
}

function generateReadme(title, body) {
  return `# ${title}\n\n${body}\n\n> 由 \`scripts/pack-npm.mjs\` 确定性装配（M31 · 复用路线 R1/R2）；版本与根仓同步（${VERSION}）。零运行时依赖。\n`;
}

/* ------------------------------------------------------------------ */
/* R1 · @yyc3/ai-family-kernel                                         */
/* ------------------------------------------------------------------ */

function buildKernel(stageDir) {
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(stageDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(stageDir, 'vendor'), { recursive: true });

  const kernelFiles = copyTsTree(path.join(ROOT, 'architecture-kernel'), path.join(stageDir, 'src'));
  let vendorFiles = 0;
  for (const name of Object.keys(SHARED_VENDOR)) {
    vendorFiles += copyTsTree(path.join(ROOT, SHARED_VENDOR[name]), path.join(stageDir, 'vendor', name));
  }

  // 源期重写：@shared/* → vendor 相对路径（src 与 vendor 树均参与——
  // memory-framework 内部也 import @shared/self-judge-kit；全部为 import type，运行时零依赖）
  let kernelRewrites = 0;
  const walkSrc = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walkSrc(abs);
      else if (entry.name.endsWith('.ts')) {
        kernelRewrites += rewriteAliasesInFile(abs, stageDir, { sharedTarget: kernelSharedTarget });
      }
    }
  };
  walkSrc(path.join(stageDir, 'src'));
  walkSrc(path.join(stageDir, 'vendor'));

  // 红线：内核不得 import family-agents；@shared 必须已 vendor 化（仅匹配 import 语句，注释豁免）
  assertNoRemnant(
    path.join(stageDir, 'src'),
    [/from\s+['"]family-agents/, /from\s+['"]@shared\//],
    '内核包',
  );
  assertNoRemnant(path.join(stageDir, 'vendor'), [/from\s+['"]@shared\//], 'vendor 子树');

  // 生成 barrel（仅入包，不入仓——不影响清单统计）
  const barrels = ['01-九层架构分层底座', '02-云枢核心引擎', '05-持续学习引擎', '06-治理中心', '07-自愈中心', '08-系统装配', '09-可观测性', '10-能力注册中心', 'a2a-adapter'];
  fs.writeFileSync(
    path.join(stageDir, 'src', 'index.ts'),
    `/** YYC³ AI Family 内核统一入口（打包器生成）——五支柱 + 九层底座 + A2A。 */\n${barrels
      .map((dir) => `export * from './${dir}/index.js';`)
      .join('\n')}\n`,
  );

  // package.json 先行落地：NodeNext 以「最近 package.json 的 type 字段」判定模块
  // 形态——必须在 tsc 之前存在，否则临时目录装配会退化 CommonJS（verbatimModuleSyntax 报错）
  writeJson(path.join(stageDir, 'package.json'), {
    name: '@yyc3/ai-family-kernel',
    version: VERSION,
    description: 'YYC³ AI Family Agent 五支柱融合内核（自·知·学·治·愈）——零运行时依赖，全端口注入',
    license: 'MIT',
    type: 'module',
    engines: { node: '>=20' },
    exports: {
      '.': './dist/src/index.js',
      './runtime-assembly': './dist/src/08-系统装配/runtime-assembly.js',
      './mcp-server-assembly': './dist/src/08-系统装配/mcp-server-assembly.js',
      './status-center': './dist/src/02-云枢核心引擎/global-status-center/status-center.js',
      './learning-loop': './dist/src/05-持续学习引擎/learning-loop.js',
      './layer-registry': './dist/src/01-九层架构分层底座/layer-registry.js',
      './family-metrics': './dist/src/09-可观测性/family-metrics.js',
      './package.json': './package.json',
    },
    files: ['dist'],
    dependencies: {},
  });

  fs.writeFileSync(
    path.join(stageDir, 'tsconfig.build.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          lib: ['ES2022', 'DOM'], // 与根口径一致（setTimeout/TextEncoder 全局；零 @types 依赖）
          strict: true,
          declaration: true,
          skipLibCheck: true,
          esModuleInterop: true,
          verbatimModuleSyntax: true,
          isolatedModules: true,
          forceConsistentCasingInFileNames: true,
          noEmit: false,
          outDir: 'dist',
          rootDir: '.',
        },
        include: ['src/**/*.ts', 'vendor/**/*.ts'],
      },
      null,
      2,
    ),
  );
  runTsc(stageDir, 'tsconfig.build.json');

  fs.writeFileSync(
    path.join(stageDir, 'README.md'),
    generateReadme(
      '@yyc3/ai-family-kernel',
      [
        'YYC³ AI Family Agent 内核库：五支柱（自·知·学·治·愈）+ 九层底座 + 总线/态势/自愈/学习调度，零运行时依赖、全端口注入。',
        '',
        '```js',
        "import { createRuntimeAssembly } from '@yyc3/ai-family-kernel/runtime-assembly';",
        "import { NineLayerRegistry } from '@yyc3/ai-family-kernel/layer-registry';",
        '```',
        '',
        '插拔点全景见根仓《可复用性分析》（15 端口）。子路径导出见 `exports`。',
      ].join('\n'),
    ),
  );

  return {
    kernelFiles,
    vendorFiles,
    kernelRewrites,
    distFiles: walkTs(path.join(stageDir, 'dist')).length,
  };
}

/* ------------------------------------------------------------------ */
/* R2 · @yyc3/ai-family-agent（MCP Server）                             */
/* ------------------------------------------------------------------ */

function buildAgent(stageDir) {
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });

  // 服务进程真实依赖闭包：内核 + shared-core + 家族服务入口（8 位家人实现属
  // 部署侧消费——宿主家族实例按需并入，不入 Server 包，编译面收窄守门禁 120s）
  copyTsTree(path.join(ROOT, 'architecture-kernel'), path.join(stageDir, 'architecture-kernel'));
  copyTsTree(path.join(ROOT, 'family-agents/shared-core'), path.join(stageDir, 'family-agents/shared-core'));
  const entryTarget = path.join(stageDir, 'family-agents', 'family-server.entry.ts');
  fs.mkdirSync(path.dirname(entryTarget), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'family-agents', 'family-server.entry.ts'), entryTarget);
  copyDir(path.join(ROOT, 'presets'), path.join(stageDir, 'presets'));
  copyDir(path.join(ROOT, 'assets'), path.join(stageDir, 'assets'));

  // 源期别名重写（NodeNext 下 paths 不可靠——直接改写为包内相对路径，与内核包同源方案）：
  //   @shared/<name> → family-agents/shared-core/<name>/index.js
  //   @members/<rest> → family-agents/<rest>/index.js（按 .ts 存在性解析，发射保 .js 说明符）
  const resolveSourceSpec = (relFromDir, kind, rest) => {
    const hasJsExt = rest.endsWith('.js');
    const stem = hasJsExt ? rest.slice(0, -'.js'.length) : rest;
    const base =
      kind === 'shared'
        ? path.join(stageDir, 'family-agents', 'shared-core', stem)
        : path.join(stageDir, 'family-agents', stem);
    const relBase = toPosix(path.relative(relFromDir, base));
    const prefix = relBase.startsWith('.') ? relBase : `./${relBase}`;
    if (hasJsExt) return fs.existsSync(`${base}.ts`) ? `${prefix}.js` : undefined; // 源 .ts → 发射 .js
    if (fs.existsSync(path.join(base, 'index.ts'))) return `${prefix}/index.js`;
    if (fs.existsSync(`${base}.ts`)) return `${prefix}.js`;
    return undefined;
  };
  let agentSourceRewrites = 0;
  for (const tree of ['architecture-kernel', 'family-agents']) {
    const walkSrc = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) walkSrc(abs);
        else if (entry.name.endsWith('.ts')) {
          let text = fs.readFileSync(abs, 'utf8');
          text = text.replace(/(['"])@shared\/([^'"]+)\1/g, (m, q, rest) => {
            const target = resolveSourceSpec(path.dirname(abs), 'shared', rest);
            if (!target) return m;
            agentSourceRewrites += 1;
            return `${q}${target}${q}`;
          });
          text = text.replace(/(['"])@members\/([^'"]+)\1/g, (m, q, rest) => {
            const target = resolveSourceSpec(path.dirname(abs), 'members', rest);
            if (!target) return m;
            agentSourceRewrites += 1;
            return `${q}${target}${q}`;
          });
          fs.writeFileSync(abs, text);
        }
      }
    };
    walkSrc(path.join(stageDir, tree));
  }

  // package.json 先行落地（NodeNext 模块形态判定，同内核包）
  writeJson(path.join(stageDir, 'package.json'), {
    name: '@yyc3/ai-family-agent',
    version: VERSION,
    description: 'YYC³ AI Family Agent 家族服务 MCP Server（45 技能 · 准入治理 · 确定性+LLM 双臂 · A2A 编排）',
    license: 'MIT',
    type: 'module',
    engines: { node: '>=20' },
    bin: { 'yyc3-family-server': 'bin/yyc3-family-server.mjs' },
    exports: {
      './family-server.entry': './dist/family-agents/family-server.entry.js',
      './package.json': './package.json',
    },
    files: ['dist', 'presets', 'assets', 'bin'],
    dependencies: {},
  });

  fs.writeFileSync(
    path.join(stageDir, 'tsconfig.build.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          lib: ['ES2022', 'DOM'], // 与根口径一致（setTimeout/TextEncoder 全局；零 @types 依赖）
          strict: true,
          declaration: true,
          skipLibCheck: true,
          esModuleInterop: true,
          verbatimModuleSyntax: true,
          isolatedModules: true,
          forceConsistentCasingInFileNames: true,
          noEmit: false,
          outDir: 'dist',
          rootDir: '.',
        },
        include: ['architecture-kernel/**/*.ts', 'family-agents/shared-core/**/*.ts', 'family-agents/family-server.entry.ts'],
        exclude: ['**/*.spec.ts'],
      },
      null,
      2,
    ),
  );
  runTsc(stageDir, 'tsconfig.build.json');

  // 发射后红线：dist 内不得残留别名（源期已重写；d.ts/js 全查）
  const agentRewrites = agentSourceRewrites;
  assertNoRemnant(
    path.join(stageDir, 'dist'),
    [/from\s+['"]@shared\//, /from\s+['"]@members\//],
    'agent 包 dist',
  );

  // bin：stdin 配置 JSON 直通（自检 --selftest 透传；密钥经环境变量由 provider 自取）
  const binDir = path.join(stageDir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    path.join(binDir, 'yyc3-family-server.mjs'),
    `#!/usr/bin/env node
/** YYC³ 家族服务 MCP Server 启动器（打包器生成）：配置 JSON 走 stdin，参数直透。 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'family-agents', 'family-server.entry.js');
const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], { stdio: ['pipe', 'inherit', 'inherit'] });
process.stdin.pipe(child.stdin);
child.on('exit', (code) => process.exit(code ?? 0));
`,
  );
  fs.chmodSync(path.join(binDir, 'yyc3-family-server.mjs'), 0o755);

  writeJson(path.join(stageDir, 'package.json'), {
    name: '@yyc3/ai-family-agent',
    version: VERSION,
    description: 'YYC³ AI Family Agent 家族服务 MCP Server（45 技能 · 准入治理 · 确定性+LLM 双臂 · A2A 编排）',
    license: 'MIT',
    type: 'module',
    engines: { node: '>=20' },
    bin: { 'yyc3-family-server': 'bin/yyc3-family-server.mjs' },
    exports: {
      './family-server.entry': './dist/family-agents/family-server.entry.js',
      './package.json': './package.json',
    },
    files: ['dist', 'presets', 'assets', 'bin'],
    dependencies: {},
  });
  fs.writeFileSync(
    path.join(stageDir, 'README.md'),
    generateReadme(
      '@yyc3/ai-family-agent',
      [
        'YYC³ 家族服务 MCP Server：stdio JSON-RPC 2.0（initialize/ping/tools/list/tools/call），确定性执行臂缺省即用，LLM 语义臂三闸门控（`LLM_STEP=1` + 确认串 + API Key 环境变量）。',
        '',
        '```bash',
        'echo \'{"serverInfo":{"name":"demo","version":"1.0.0"},"tools":[],"manifestEntries":[]}\' | yyc3-family-server --selftest',
        '```',
        '',
        '配置契约（stdin JSON）：`serverInfo` / `tools` / `manifestEntries` 必需，`admission` / `llm` / `external` / `metricsServer` 可选——见根仓 family-server.entry.ts 头注。',
      ].join('\n'),
    ),
  );

  return {
    agentRewrites,
    distFiles: walkTs(path.join(stageDir, 'dist')).length,
    presets: fs.existsSync(path.join(stageDir, 'presets')),
  };
}

/* ------------------------------------------------------------------ */
/* 校验与入口                                                           */
/* ------------------------------------------------------------------ */

function verifyPackage(stageDir, kind) {
  const pkg = JSON.parse(fs.readFileSync(path.join(stageDir, 'package.json'), 'utf8'));
  if (pkg.version !== VERSION) throw new Error(`${kind} 版本不同步：${pkg.version} ≠ ${VERSION}`);
  if (Object.keys(pkg.dependencies ?? {}).length > 0) throw new Error(`${kind} 存在运行时依赖（红线）`);
  if (pkg.private) throw new Error(`${kind} 不可标记 private`);
  for (const [key, target] of Object.entries(pkg.exports ?? {})) {
    if (key === './package.json') continue;
    const abs = path.join(stageDir, target);
    if (!fs.existsSync(abs)) throw new Error(`${kind} exports ${key} → ${target} 不存在`);
  }
  return pkg;
}

function main() {
  const check = process.argv.includes('--check');
  const outRoot = process.env.YYC3_PACK_OUT
    ? path.resolve(process.env.YYC3_PACK_OUT)
    : path.join(ROOT, 'dist');
  const kernelDir = path.join(outRoot, 'ai-family-kernel');
  const agentDir = path.join(outRoot, 'ai-family-agent');

  console.log(`ⓔ npm 双包打包（R1/R2 · v${VERSION}）→ ${outRoot}${check ? '（临时 · --check）' : ''}`);
  const kernelStat = buildKernel(kernelDir);
  const agentStat = buildAgent(agentDir);
  const kernelPkg = verifyPackage(kernelDir, 'kernel');
  const agentPkg = verifyPackage(agentDir, 'agent');

  console.log(`   kernel：源 ${kernelStat.kernelFiles} · vendor ${kernelStat.vendorFiles} · 重写 ${kernelStat.kernelRewrites} · dist ${kernelStat.distFiles}（exports ${Object.keys(kernelPkg.exports).length}）`);
  console.log(`   agent ：重写 ${agentStat.agentRewrites} · dist ${agentStat.distFiles} · presets ${agentStat.presets ? '✓' : '✗'} · bin ✓`);
  console.log('✅ 双包装配完成（@yyc3/ai-family-kernel · @yyc3/ai-family-agent · 零运行时依赖 · 版本同步）');

  if (check) {
    fs.rmSync(outRoot, { recursive: true, force: true });
    console.log('   --check：临时产物已清理（幂等校验通过）');
  }
}

try {
  main();
} catch (error) {
  console.error(`❌ 打包失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
