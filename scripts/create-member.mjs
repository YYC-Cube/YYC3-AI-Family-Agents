#!/usr/bin/env node
/**
 * 家人模板脚手架 CLI（create-member.mjs）—— M33 · 复用路线 R4。
 *
 * 模板源：presets/member-agent/（.tpl 占位符，{{MEMBER_*}} 12 项）。
 * 与 scripts/create-member.sh（原初 bash 实现）语义一致，另增：
 *   - check 模式：按各家人 agent.yaml 反解参数 → 重生成 → 与 committed 树
 *     **逐字节零漂移**比对 + 孤儿扫描（T6 生成/校验范式）；
 *   - --out-dir：隔离输出（契约测试用，缺省 family-agents/）。
 *
 * 零漂移范围：7 位非千行家人（member-qianhang 为已接线参考实现——
 * 系统提示词/记忆绑定/程序规则/e2e 基准为手工增强，不参与模板校验）。
 * 白名单：procedural/rules-draft.yaml（学习管线产物，不入模板）。
 *
 * 用法：
 *   node scripts/create-member.mjs create --id member-x --name <名号> --en-name <En> \
 *     --role <角色> --layer L2..L9 --number NN [--group business-layer|core-layer] \
 *     [--hotline <号>] [--color <#hex>] [--motto <座右铭>] [--out-dir <dir>]
 *   node scripts/create-member.mjs check
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRESET_DIR = path.join(ROOT, 'presets', 'member-agent');
const MEMBERS_DIR = path.join(ROOT, 'family-agents');

const LAYER_NAMES = {
  L2: '千里伯乐',
  L3: '预见先知',
  L4: '语枢万物',
  L5: '言启千行',
  L6: '创想灵韵',
  L7: '格物致知',
  L8: '智云守护',
  L9: '万象归元',
};

/** 模板占位符 → 参数键（替换顺序即数组序——长值优先避免子串遮蔽）。 */
function placeholdersOf(p) {
  return [
    ['{{MEMBER_ID}}', p.id],
    ['{{MEMBER_NUMBER}}', p.number],
    ['{{MEMBER_NAME}}', p.name],
    ['{{MEMBER_EN_NAME}}', p.enName],
    ['{{MEMBER_ROLE_EN}}', p.roleEn],
    ['{{MEMBER_ROLE}}', p.role],
    ['{{MEMBER_LAYER_NAME}}', p.layerName],
    ['{{MEMBER_LAYER}}', p.layer],
    ['{{MEMBER_GROUP}}', p.group],
    ['{{MEMBER_MOTTO}}', p.motto],
    ['{{MEMBER_HOTLINE}}', p.hotline],
    ['{{MEMBER_COLOR}}', p.color],
  ];
}

function substitute(content, params) {
  let out = content;
  for (const [token, value] of placeholdersOf(params)) out = out.split(token).join(value);
  return out;
}

/** 复制 preset → 目标目录：README 排除、.tpl 去后缀并替换占位符。 */
function generateInto(targetDir, params) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(PRESET_DIR, targetDir, {
    recursive: true,
    filter: (src) => path.basename(src) !== 'README.md' && path.basename(src) !== '.DS_Store',
  });
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      const isTpl = entry.name.endsWith('.tpl');
      const outName = isTpl ? entry.name.slice(0, -'.tpl'.length) : entry.name;
      const outAbs = path.join(path.dirname(abs), outName);
      fs.writeFileSync(outAbs, substitute(fs.readFileSync(abs, 'utf8'), params));
      if (isTpl) fs.rmSync(abs);
    }
  };
  walk(targetDir);
}

/* ------------------------------------------------------------------ */
/* check 模式：agent.yaml 反解参数 → 重生成 → 零漂移比对 + 孤儿扫描      */
/* ------------------------------------------------------------------ */

/** 解析 agent.yaml 顶层标量（key: value；列表段头无值自动跳过）。 */
function parseAgentYaml(yamlText) {
  const scalars = {};
  for (const line of yamlText.split('\n')) {
    const m = line.match(/^([^\s#][^:]*):\s*(.*)$/);
    if (m && m[2] !== '') scalars[m[1].trim()] = m[2].trim();
  }
  return scalars;
}

function stripQuotes(v) {
  return v.replace(/^"(.*)"$/s, '$1');
}

/** 座右铭约定：agent.yaml 值含一层「」包裹，模板再包一层——参数剥一层。 */
function mottoParam(mottoValue) {
  const v = stripQuotes(mottoValue);
  return v.startsWith('「') && v.endsWith('」') ? v.slice(1, -1) : v;
}

function paramsFromAgentYaml(yamlText) {
  const y = parseAgentYaml(yamlText);
  const numberMatch = stripQuotes(y['编号'] ?? '').match(/010301-(\d{2})$/);
  return {
    name: y['名号'] ?? '',
    enName: y['英文名'] ?? '',
    roleEn: y['英文角色'] ?? '',
    role: y['角色'] ?? '',
    layer: y['层级'] ?? '',
    layerName: y['层级名称'] ?? '',
    group: y['所属分组'] ?? '',
    motto: mottoParam(y['座右铭'] ?? ''),
    hotline: stripQuotes(y['专属热线'] ?? ''),
    color: stripQuotes(y['品牌色'] ?? ''),
    number: numberMatch ? numberMatch[1] : '',
  };
}

const CHECK_EXCLUDE_MEMBERS = ['member-qianhang']; // 已接线参考实现（手工增强）
// 演进文件白名单：生成后按家人定制（内容自由 · 必须存在；质量由专项契约守——
// prompts 由 P1-T5 提示词契约守质，rules-draft 为学习管线产物）
const DRIFT_WHITELIST = new Set([
  'procedural/rules-draft.yaml',
  'prompts/intent-detection.prompt.ts',
  'prompts/query-parsing.prompt.ts',
]);

function checkMode() {
  const memberDirs = [];
  for (const group of ['business-layer', 'core-layer']) {
    const groupDir = path.join(MEMBERS_DIR, group);
    if (!fs.existsSync(groupDir)) continue;
    for (const entry of fs.readdirSync(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('member-')) continue;
      if (CHECK_EXCLUDE_MEMBERS.includes(entry.name)) continue;
      memberDirs.push({ group, id: entry.name, dir: path.join(groupDir, entry.name) });
    }
  }
  memberDirs.sort((a, b) => a.id.localeCompare(b.id));

  const failures = [];
  for (const member of memberDirs) {
    const agentYamlPath = path.join(member.dir, 'agent.yaml');
    if (!fs.existsSync(agentYamlPath)) {
      failures.push(`${member.id}：缺 agent.yaml`);
      continue;
    }
    const params = {
      ...paramsFromAgentYaml(fs.readFileSync(agentYamlPath, 'utf8')),
      id: member.id,
      group: member.group,
    };
    if (!params.number) failures.push(`${member.id}：编号不合规（预期 010301-NN）`);

    // 重生成到临时目录后逐字节比对
    const regenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-member-check-'));
    try {
      generateInto(regenDir, params);
      const relGenerated = walkFiles(regenDir).map((f) => path.relative(regenDir, f));
      const relCommitted = walkFiles(member.dir).map((f) => path.relative(member.dir, f));

      for (const rel of relGenerated) {
        const relPosix = toPosix(rel);
        if (DRIFT_WHITELIST.has(relPosix)) {
          if (!fs.existsSync(path.join(member.dir, rel))) {
            failures.push(`${member.id}/${relPosix}：演进文件缺失（白名单要求存在）`);
          }
          continue; // 内容按家人定制，不做字节比对
        }
        const gen = fs.readFileSync(path.join(regenDir, rel));
        const committedPath = path.join(member.dir, rel);
        if (!fs.existsSync(committedPath)) {
          failures.push(`${member.id}/${relPosix}：committed 缺失（模板有）`);
          continue;
        }
        if (!gen.equals(fs.readFileSync(committedPath))) {
          failures.push(`${member.id}/${relPosix}：内容漂移`);
        }
      }
      for (const rel of relCommitted) {
        if (DRIFT_WHITELIST.has(toPosix(rel))) continue;
        if (!fs.existsSync(path.join(regenDir, rel))) {
          failures.push(`${member.id}/${toPosix(rel)}：孤儿文件（模板无 · 非白名单）`);
        }
      }
    } finally {
      fs.rmSync(regenDir, { recursive: true, force: true });
    }
  }

  if (failures.length > 0) {
    console.error(`❌ 家人模板零漂移校验失败（${memberDirs.length} 家人 · ${failures.length} 处）：`);
    for (const line of failures.slice(0, 12)) console.error(`  - ${line}`);
    if (failures.length > 12) console.error(`  … 其余 ${failures.length - 12} 处`);
    process.exit(1);
  }
  console.log(`✅ 家人模板零漂移：${memberDirs.length} 家人逐字节一致（白名单 ${DRIFT_WHITELIST.size} 项 · 千行为已接线参考不校验）`);
}

function walkFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(abs, out);
    else out.push(abs);
  }
  return out;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

/* ------------------------------------------------------------------ */
/* create 模式                                                          */
/* ------------------------------------------------------------------ */

function createMode(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) args[argv[i]] = argv[i + 1] ?? '';
  }
  const p = {
    id: args['--id'] ?? '',
    name: args['--name'] ?? '',
    enName: args['--en-name'] ?? '',
    role: args['--role'] ?? '',
    layer: args['--layer'] ?? '',
    number: args['--number'] ?? '',
    group: args['--group'] ?? 'business-layer',
    hotline: args['--hotline'] ?? '0379-0000',
    color: args['--color'] ?? '#0088cc',
    motto: args['--motto'] ?? '待补全——以诚相待，不负所托',
    outDir: args['--out-dir'] ?? MEMBERS_DIR,
  };
  p.layerName = LAYER_NAMES[p.layer] ?? '';
  p.roleEn = p.enName;

  const fail = (msg) => {
    console.error(`错误：${msg}`);
    process.exit(1);
  };
  for (const [flag, value] of [
    ['--id', p.id],
    ['--name', p.name],
    ['--en-name', p.enName],
    ['--role', p.role],
    ['--layer', p.layer],
    ['--number', p.number],
  ]) {
    if (!value) fail(`缺少必填参数 ${flag}`);
  }
  if (!p.id.startsWith('member-')) fail(`--id 必须以 'member-' 开头，当前为 '${p.id}'`);
  if (!LAYER_NAMES[p.layer]) fail(`--layer 必须为 L2..L9，当前为 '${p.layer}'`);
  if (!['business-layer', 'core-layer'].includes(p.group)) fail(`--group 必须为 business-layer 或 core-layer，当前为 '${p.group}'`);
  if (!/^\d{2}$/.test(p.number)) fail(`--number 必须为两位数字（如 01），当前为 '${p.number}'`);
  if (!fs.existsSync(PRESET_DIR)) fail(`找不到模板目录 —— ${PRESET_DIR}`);

  const targetDir = path.resolve(p.outDir, p.group, p.id);
  if (!targetDir.startsWith(path.resolve(p.outDir) + path.sep)) fail(`--out-dir 越界`);
  if (fs.existsSync(targetDir)) fail(`目标已存在，禁止覆盖 —— ${targetDir}`);

  generateInto(targetDir, p);
  console.log(`✅ 已创建家人：${p.name}（${p.id}）`);
  console.log(`   编号：010301-${p.number}   层级：${p.layer} ${p.layerName}   分组：${p.group}`);
  console.log(`   路径：${targetDir}`);
  console.log('下一步：编辑 agent.yaml / system-prompt.md / procedural 规则；运行 pnpm typecheck && pnpm member:check');
}

/* ------------------------------------------------------------------ */

const mode = process.argv[2];
if (mode === 'check') checkMode();
else if (mode === 'create') createMode(process.argv.slice(3));
else {
  console.error('用法：node scripts/create-member.mjs create <flags> | check');
  process.exit(1);
}
