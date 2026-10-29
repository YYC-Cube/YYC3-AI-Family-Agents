// @ts-nocheck
/**
 * npm 双包打包契约（npm-pack）—— M31 · 复用路线 R1/R2（可复用性分析 §五）。
 *
 * 验收：
 *   P1 双包装配成功：YYC3_PACK_OUT 隔离目录构建 exit 0（kernel 116 源 + 31 vendor；
 *      agent 全量预编译 258 产物）
 *   P2 内核包形态：@yyc3/ai-family-kernel —— name/type/deps {} · exports 子路径产物
 *      存在（含 runtime-assembly / layer-registry）· dist/vendor 类型可达
 *   P3 MCP Server 包形态：@yyc3/ai-family-agent —— bin（shebang + 入口直通）·
 *      编译入口存在 · presets/assets 入包
 *   P4 红线与版本同步：dist 无 @shared/@members 残留 · kernel 无 family-agents import ·
 *      两包 dependencies 恒空 · 版本 === 根 package.json（同步递增）
 *
 * 运行：tsc 编译 + node（零依赖 harness，范式同 prompt.contract；本套件真实执行打包）。
 */

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
    toContain: (exp) => {
      if (!actual.includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${String(actual).slice(0, 200)}`);
    },
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`期望长度 ${n}，实际 ${actual.length}`);
    },
  });
}

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd(); // 门禁以仓库根为 cwd 运行套件（编译产物在临时目录，禁用 import.meta 定位）

// 隔离装配目录（模块作用域——底部清理 IIFE 与用例闭包共用）
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-npm-pack-contract-'));
const kernelDir = path.join(outDir, 'ai-family-kernel');
const agentDir = path.join(outDir, 'ai-family-agent');

/** 包根边界守卫：解析目标并强制不出包根（路径穿越红线）。 */
function safeJoin(pkgRoot, relTarget) {
  const target = path.resolve(pkgRoot, relTarget);
  if (target !== pkgRoot && !target.startsWith(pkgRoot + path.sep)) {
    throw new Error(`路径越界（${relTarget} 越出 ${pkgRoot}）`);
  }
  return target;
}

/** 递归收集文件绝对路径。 */
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

/** 统计目录内匹配 import 别名模式的文件数（红线计量）。 */
function countAliasImports(dir, pattern) {
  let hits = 0;
  for (const file of walk(dir)) {
    if (!file.endsWith('.js') && !file.endsWith('.d.ts') && !file.endsWith('.ts')) continue;
    if (pattern.test(fs.readFileSync(file, 'utf8'))) hits += 1;
  }
  return hits;
}

describe('npm 双包打包契约（M31 · R1/R2）', () => {
  it('P1 双包装配成功：隔离目录构建 exit 0，两包 package.json 就位', () => {
    try {
      execFileSync('node', ['scripts/pack-npm.mjs'], {
        cwd: ROOT,
        env: { ...process.env, YYC3_PACK_OUT: outDir },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      const detail = String((e && (e.stderr || e.stdout)) || e.message).slice(0, 300);
      throw new Error(`打包器非零退出：${detail}`);
    }
    expect(fs.existsSync(path.join(kernelDir, 'package.json'))).toBeTruthy();
    expect(fs.existsSync(path.join(agentDir, 'package.json'))).toBeTruthy();
    expect(fs.existsSync(path.join(kernelDir, 'dist', 'src', 'index.js'))).toBeTruthy(); // 生成 barrel 已编译
  });

  it('P2 内核包形态：exports 子路径产物存在 · vendor 类型可达 · 零依赖', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(kernelDir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('@yyc3/ai-family-kernel');
    expect(pkg.type).toBe('module');
    expect(pkg.private).toBeFalsy();
    expect(Object.keys(pkg.dependencies ?? {})).toHaveLength(0); // 零运行时依赖红线
    for (const [key, target] of Object.entries(pkg.exports)) {
      if (key === './package.json') continue;
      expect(fs.existsSync(safeJoin(kernelDir, target))).toBeTruthy();
    }
    expect(pkg.exports['./runtime-assembly']).toContain('runtime-assembly');
    expect(fs.existsSync(path.join(kernelDir, 'dist', 'vendor', 'self-judge-kit', 'index.d.ts'))).toBeTruthy();
    // 红线：内核不 import family-agents（src 树零命中）
    expect(countAliasImports(path.join(kernelDir, 'src'), /from\s+['"]family-agents/)).toBe(0);
  });

  it('P3 MCP Server 包形态：bin 直通 · 编译入口存在 · presets/assets 入包', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(agentDir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('@yyc3/ai-family-agent');
    expect(Object.keys(pkg.dependencies ?? {})).toHaveLength(0);
    const binFile = safeJoin(agentDir, pkg.bin['yyc3-family-server']);
    expect(fs.existsSync(binFile)).toBeTruthy();
    const binText = fs.readFileSync(binFile, 'utf8');
    expect(binText.startsWith('#!/usr/bin/env node')).toBeTruthy();
    expect(binText).toContain('family-server.entry.js');
    expect(fs.existsSync(path.join(agentDir, 'dist', 'family-agents', 'family-server.entry.js'))).toBeTruthy();
    expect(fs.existsSync(path.join(agentDir, 'dist', 'family-agents', 'family-server.entry.d.ts'))).toBeTruthy();
    expect(fs.existsSync(path.join(agentDir, 'presets', 'family-manifest.yaml'))).toBeTruthy();
    expect(fs.existsSync(path.join(agentDir, 'assets', 'schemas'))).toBeTruthy();
  });

  it('P4 红线与版本同步：别名零残留 · 两包 dependencies 恒空 · 版本 === 根', () => {
    const rootVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
    for (const dir of [kernelDir, agentDir]) {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      expect(pkg.version).toBe(rootVersion); // 版本同步递增
      expect(Object.keys(pkg.dependencies ?? {})).toHaveLength(0);
    }
    expect(countAliasImports(path.join(agentDir, 'dist'), /from\s+['"]@shared\//)).toBe(0);
    expect(countAliasImports(path.join(agentDir, 'dist'), /from\s+['"]@members\//)).toBe(0);
    expect(countAliasImports(path.join(kernelDir, 'src'), /from\s+['"]@shared\//)).toBe(0);
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
  fs.rmSync(outDir, { recursive: true, force: true }); // 隔离产物清理（校验完成后）
  console.log(`\n结果：${passed} 通过 / ${failures.length} 失败 / 共 ${queue.length} 例`);
  if (failures.length > 0) process.exit(1);
})();
