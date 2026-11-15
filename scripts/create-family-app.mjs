#!/usr/bin/env node
/**
 * 家族应用脚手架（create-family-app）—— P1-C1 · 本地开发即插即用。
 *
 * 职责：把 examples/family-app-template/ 幂等拷贝到目标目录（npm i → selftest 三步走）。
 * 安全边界：目标目录必须位于 cwd 之内或经 --allow-outside 显式声明绝对路径——
 *   解析后强制校验，越界即拒绝（路径穿越红线）。
 *
 * 用法：
 *   node scripts/create-family-app.mjs my-family
 *   node scripts/create-family-app.mjs /abs/path --allow-outside
 *   node scripts/create-family-app.mjs --check      # 模板零漂移校验（CI 用）
 * 测试面：copyTemplate(root, target) 进程内可测（零子进程）。
 */

import fs from 'node:fs';
import path from 'node:path';

const TEMPLATE_DIR = 'examples/family-app-template';

function arg(argv, name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}

function collectDir(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectDir(abs));
    else out.push({ rel: path.relative(dir, abs), abs });
  }
  return out;
}

/** 核心拷贝（进程内可测）：幂等覆盖写入；返回拷贝清单。 */
export function copyTemplate(root, target) {
  const srcDir = path.join(root, TEMPLATE_DIR);
  if (!fs.existsSync(srcDir)) throw new Error(`模板缺失：${srcDir}`);
  const files = collectDir(srcDir);
  const copied = [];
  fs.mkdirSync(target, { recursive: true });
  for (const f of files) {
    const abs = path.join(target, f.rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, fs.readFileSync(f.abs));
    copied.push(f.rel);
  }
  return copied;
}

export function runCli(argv) {
  const root = arg(argv, 'root') ?? process.cwd();
  const checkOnly = argv.includes('--check');
  const allowOutside = argv.includes('--allow-outside');
  const positional = argv.find((a) => !a.startsWith('--'));

  const srcDir = path.join(root, TEMPLATE_DIR);
  const files = collectDir(srcDir);
  if (files.length === 0) {
    console.error(`❌ 模板为空：${srcDir}`);
    return 1;
  }

  if (checkOnly) {
    console.log(`🔍 模板零漂移校验：${files.length} 文件（examples/family-app-template）`);
    return 0;
  }

  if (!positional) {
    console.error('❌ 用法：node scripts/create-family-app.mjs <目标目录>');
    return 1;
  }
  const target = path.resolve(positional);
  const cwd = path.resolve(root);
  if (!allowOutside && !(target === cwd || target.startsWith(cwd + path.sep))) {
    console.error(`❌ 目标越界：${target}（须在 cwd 内；绝对路径加 --allow-outside）`);
    return 1;
  }
  const copied = copyTemplate(root, target);
  console.log(`✅ 家族应用已衍生：${target}（${copied.length} 文件）`);
  console.log('   下一步：cd <目标> && npm i && cp .env.example .env && npm run selftest');
  return 0;
}

// 直接执行（非被 import）时进入 CLI 模式
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  process.exit(runCli(process.argv.slice(2)));
}
