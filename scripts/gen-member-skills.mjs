#!/usr/bin/env node
/**
 * 成员技能视图生成（gen-member-skills）—— P1-B3 · Skills 形态成员技能组。
 *
 * 人格单一事实源：
 *   identity —— family-agents/{core,business}-layer/member-<slug>/agent.yaml（编号/名号/角色/座右铭…）
 *   skills  —— presets/family-manifest.yaml（owner 编号归属 + delegation 协同矩阵）
 * 产物：packaging/member-skills/<slug>/SKILL.md —— 8 成员 granular 技能视图
 *   （与主技能 yyc3-ai-family-coding 路由表互补：主技能=路由，成员技能=深度视角）。
 *   红线：改人格 = 改 agent.yaml/manifest，不改产物；产物零手改（--check 字节级零漂移）。
 *
 * 用法：
 *   pnpm member-skills          # 生成全部（写盘）
 *   node scripts/gen-member-skills.mjs --check   # 零漂移校验（exit 0/1）
 *   node scripts/gen-member-skills.mjs --json    # JSON 明细（供契约套件消费）
 * 测试面：generateMemberSkills(root) 进程内可测（零子进程）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseYaml } from './lib/yaml-lite.mjs';

/** 八家臣（排除 infra 成员：edge-executor / skill-patroller 不参与人格视图）。 */
const EXCLUDE_DIRS = new Set(['member-edge-executor', 'member-skill-patroller']);
const LAYERS = ['business-layer', 'core-layer'];
const OUT_DIR = 'packaging/member-skills';

function arg(argv, name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}

/** 读取全部成员身份（agent.yaml）→ [{ slug, id: 编号, meta }]。 */
function loadMembers(root) {
  const members = [];
  for (const layer of LAYERS) {
    const layerDir = path.join(root, 'family-agents', layer);
    if (!fs.existsSync(layerDir)) continue;
    for (const entry of fs.readdirSync(layerDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('member-') || EXCLUDE_DIRS.has(entry.name)) continue;
      const yamlPath = path.join(layerDir, entry.name, 'agent.yaml');
      if (!fs.existsSync(yamlPath)) continue;
      const meta = parseYaml(fs.readFileSync(yamlPath, 'utf8'));
      members.push({ slug: entry.name.slice('member-'.length), id: String(meta['编号'] ?? ''), meta });
    }
  }
  members.sort((a, b) => a.id.localeCompare(b.id));
  return members;
}

/** 角色关键词提取（description 触发信号：取角色串前两段 + 座右铭）。 */
function roleKeywords(role) {
  const seg = String(role).split('·').map((s) => s.trim()).filter(Boolean);
  return seg.length >= 2 ? seg.slice(0, 2).join('·') : String(role);
}

/** 生成单员 SKILL.md（确定性：技能按 id 排序 · 委托行按名号排序）。 */
function renderMember(member, skills, delegation) {
  const { slug, id, meta } = member;
  const name = String(meta['名号'] ?? slug);
  const en = String(meta['英文名'] ?? slug);
  const role = String(meta['角色'] ?? '');
  const motto = String(meta['座右铭'] ?? '').replace(/[「」]/g, '');
  const inbound = Object.entries(delegation ?? {})
    .filter(([from, targets]) => from !== name && targets && targets[name])
    .map(([from]) => `来自 ${from}：${delegation[from][name]}`)
    .sort();
  const outbound = Object.entries(delegation?.[name] ?? {})
    .map(([to, why]) => `委托 ${to}：${why}`)
    .sort();

  const skillLines = skills
    .map((s) => `- \`${s.id}\`（v${s.version ?? '?'}）— ${s.name}：${s.description ?? ''}`)
    .join('\n');

  const content = `---
name: yyc3-${slug}
description: ${name}（${en} · ${roleKeywords(role)}）。当用户提及「${name}」、${en}、${roleKeywords(role)}，或要求${roleKeywords(role)}相关任务时使用。座右铭：${motto}
---

# ${name} · ${en} — 家族成员技能（派生视图）

> 座右铭：${motto}
> 层级：${meta['层级'] ?? '-'} · ${meta['层级名称'] ?? '-'} ｜ 分组：${meta['所属分组'] ?? '-'} ｜ 编号：${id}

## 职责与出场

${role}。

## 专属技能（来自家族清单 · 单一事实源）

${skillLines || '- （无专属技能——经主技能路由表委托）'}

## 协同（委托矩阵 · 谁委托我 / 我委托谁）

${inbound.length ? inbound.join('\n') : '- （无入站委托）'}

${outbound.length ? outbound.join('\n') : '- （无出站委托）'}

## 纪律

- 人格单一事实源：\`family-manifest.yaml\` + \`agent.yaml\`——本技能为派生视图，不手改。
- 家族协同主技能：\`yyc3-ai-family-coding\`（路由表 / 审核闭环）；本技能聚焦本成员深度视角。
`;
  return content;
}

/** 核心生成（进程内可测）：返回 { members, files: Map<relPath, content> }。 */
export function generateMemberSkills(root) {
  const members = loadMembers(root);
  const manifest = parseYaml(fs.readFileSync(path.join(root, 'presets', 'family-manifest.yaml'), 'utf8'));
  const skills = Array.isArray(manifest.skills) ? manifest.skills : [];
  const delegation = manifest.delegation ?? {};

  const files = new Map();
  for (const member of members) {
    const owned = skills
      .filter((s) => String(s.owner) === member.id)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    files.set(`${OUT_DIR}/${member.slug}/SKILL.md`, renderMember(member, owned, delegation));
  }
  return { members, files };
}

export function runCli(argv) {
  const root = arg(argv, 'root') ?? process.cwd();
  const checkOnly = argv.includes('--check');
  const asJson = argv.includes('--json');

  const { members, files } = generateMemberSkills(root);
  if (members.length !== 8) {
    console.error(`❌ 成员数异常：期望 8，实际 ${members.length}`);
    return 1;
  }

  let drifted = 0;
  for (const [rel, content] of files) {
    const abs = path.join(root, rel);
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
    console.log(JSON.stringify({ members: members.map((m) => ({ slug: m.slug, id: m.id, 名号: m.meta['名号'] })), files: files.size }));
  } else {
    console.log(
      checkOnly
        ? `🔍 成员技能零漂移校验：${members.length} 员 · ${files.size} 文件 · ${drifted === 0 ? '✅ 零漂移' : `❌ ${drifted} 漂移`}`
        : `📦 成员技能视图：${members.length} 员 · ${files.size} 文件 → ${path.join(root, OUT_DIR)}`,
    );
  }
  return drifted === 0 ? 0 : 1;
}

// 直接执行（非被 import）时进入 CLI 模式
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  process.exit(runCli(process.argv.slice(2)));
}
