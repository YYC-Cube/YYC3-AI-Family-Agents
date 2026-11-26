#!/usr/bin/env node
/**
 * 插件装配生成（gen-plugin）—— P1-B4 · marketplace 分发面。
 *
 * 职责：把主技能（packaging/yyc3-ai-family-coding/**）+ 8 成员技能视图
 *   （packaging/member-skills/<slug>/SKILL.md，gen-member-skills 产物）装配为
 *   自包含 ZCode 插件目录 dist/yyc3-family-plugin/：
 *     .zcode-plugin/plugin.json   —— 组件清单（skills 9 项 · 版本随根仓）
 *     marketplace.json            —— 市场目录描述（anthropics 兼容形态）
 *     yyc3-<name>/SKILL.md[+references/] —— 技能组件（镜像 packaging 源）
 *   安装：Settings → Plugin Management → Discover → + → 本地目录 → dist/yyc3-family-plugin。
 *   --check：字节级零漂移校验（CI/回归用）。红线：产物零手改。
 *
 * 用法：
 *   pnpm plugin:assemble              # 装配（写盘 dist/yyc3-family-plugin）
 *   node scripts/gen-plugin.mjs --check
 *   node scripts/gen-plugin.mjs --json
 * 测试面：assemblePlugin(root, outDir) 进程内可测（零子进程）。
 */

import fs from 'node:fs';
import path from 'node:path';

const MAIN_SKILL = 'yyc3-ai-family-coding';
const MEMBER_SKILLS_DIR = 'packaging/member-skills';
const MAIN_SKILL_DIR = `packaging/${MAIN_SKILL}`;
const PLUGIN_DIR = 'dist/yyc3-family-plugin';
/** 插件名（ZCode 规范：^[a-z0-9][a-z0-9._-]{0,127}$）。 */
const PLUGIN_NAME = 'yyc3-family';

function arg(argv, name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}

function collectDir(dir, prefix) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectDir(abs, `${prefix}/${entry.name}`));
    else out.push({ rel: `${prefix}/${entry.name}`, abs });
  }
  return out;
}

/** 核心装配（进程内可测）：返回 { files: Map<relPath, content>, skills: string[] }。 */
export function assemblePlugin(root, outDir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  const skills = [MAIN_SKILL];
  const files = new Map();

  // 主技能（SKILL.md + references/ 全量镜像）
  for (const f of collectDir(path.join(root, MAIN_SKILL_DIR), MAIN_SKILL)) {
    files.set(f.rel, fs.readFileSync(f.abs, 'utf8'));
  }

  // 成员技能视图（8 员）
  const membersDir = path.join(root, MEMBER_SKILLS_DIR);
  for (const entry of fs.readdirSync(membersDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const slug = `yyc3-${entry.name}`;
    skills.push(slug);
    for (const f of collectDir(path.join(membersDir, entry.name), slug)) {
      files.set(f.rel, fs.readFileSync(f.abs, 'utf8'));
    }
  }
  skills.sort();

  files.set(
    '.zcode-plugin/plugin.json',
    `${JSON.stringify(
      {
        name: PLUGIN_NAME,
        version: pkg.version,
        description: 'YYC³ 八家臣 8-Agent 家族协同开发技能组——主技能路由（意图路由表/审核闭环）+ 8 成员深度视角。MCP 能力接入见 @yyc3/ai-family-agent。',
        skills,
      },
      null,
      2,
    )}\n`,
  );

  files.set(
    'marketplace.json',
    `${JSON.stringify(
      {
        name: 'yyc3-family',
        owner: { name: 'YYC-Cube' },
        plugins: [
          {
            name: PLUGIN_NAME,
            version: pkg.version,
            source: 'https://github.com/YYC-Cube/YYC3-AI-Family-Agents',
            description: '八家臣家族协同技能组（1 主技能 + 8 成员技能 · 人格单一事实源派生视图）',
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  return { files, skills, name: PLUGIN_NAME, version: pkg.version };
}

export function runCli(argv) {
  const root = arg(argv, 'root') ?? process.cwd();
  const outDir = arg(argv, 'out') ?? path.join(root, PLUGIN_DIR);
  const checkOnly = argv.includes('--check');
  const asJson = argv.includes('--json');

  const { files, skills, version } = assemblePlugin(root, outDir);

  let drifted = 0;
  // 装配前清空输出目录（孤儿清理：改名/移除的技能组件不得残留——审核发现 stale 组件与新版并存）
  if (!checkOnly) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  for (const [rel, content] of files) {
    const abs = path.join(outDir, rel);
    if (checkOnly) {
      const onDisk = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
      if (onDisk !== content) {
        drifted += 1;
        console.error(`❌ 零漂移校验失败：${rel}`);
      }
    } else {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ name: 'yyc3-family', version, skills, files: files.size }));
  } else {
    console.log(
      checkOnly
        ? `🔍 插件装配零漂移校验：${skills.length} 技能 · ${files.size} 文件 · ${drifted === 0 ? '✅ 零漂移' : `❌ ${drifted} 漂移`}`
        : `📦 插件装配：yyc3-family@${version} · ${skills.length} 技能 · ${files.size} 文件 → ${outDir}`,
    );
  }
  return drifted === 0 ? 0 : 1;
}

// 直接执行（非被 import）时进入 CLI 模式
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  process.exit(runCli(process.argv.slice(2)));
}
