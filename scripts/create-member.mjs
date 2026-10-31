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
// prompts 由 P1-T5 提示词契约守质，rules-draft 为学习管线产物）；
// E2a 起支持成员限定条目 `member-xxx/<rel>`（裂变产物的 CO-STAR 定制段）
const DRIFT_WHITELIST = new Set([
  'procedural/rules-draft.yaml',
  'prompts/intent-detection.prompt.ts',
  'prompts/query-parsing.prompt.ts',
  // E2a 试点（管线产出定制三件 · 存在性与内容由 fission-pipeline 契约守）
  'member-edge-executor/system-prompt.md',
  'member-edge-executor/member-manifest.yaml',
  'member-edge-executor/agent-card.json',
  'member-skill-patroller/system-prompt.md',
  'member-skill-patroller/member-manifest.yaml',
  'member-skill-patroller/agent-card.json',
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
        const whitelisted = DRIFT_WHITELIST.has(relPosix) || DRIFT_WHITELIST.has(`${member.id}/${relPosix}`);
        if (whitelisted) {
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
        const relPosix2 = toPosix(rel);
        if (DRIFT_WHITELIST.has(relPosix2) || DRIFT_WHITELIST.has(`${member.id}/${relPosix2}`)) continue;
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
/* scaffold 模式（E2a · 门禁全自动裂变管线）                              */
/* ------------------------------------------------------------------ */

/** 人格红线：八位家族核心身份不可稀释（名号 + 专属职务头衔，命中即拒）。 */
const FAMILY_IDENTITY = [
  '千里·伯乐', '言启·千行', '预见·先知', '语枢·万物', '创想·灵韵', '格物·宗师', '智云·守护', '元启·天枢',
  '首席推荐官', '首席预言家', '首席思考者', '首席导航员', '首席创意官', '首席质量官', '首席安全官',
];

const PILLARS = new Set(['自', '知', '学', '治', '愈']);
/** 层级 → 分组（与八家人分布对齐：L2–L5 业务执行层 / L6–L9 核心保障决策层）。 */
function groupOfLayer(layer) {
  return ['L2', 'L3', 'L4', 'L5'].includes(layer) ? 'business-layer' : 'core-layer';
}

/** 读家族主清单技能 id 集（查重源一：manifest 文本内出现的技能 slug）。 */
function manifestSkillSlugs() {
  try {
    return fs.readFileSync(path.join(ROOT, 'presets', 'family-manifest.yaml'), 'utf8');
  } catch {
    return '';
  }
}

function scaffoldMode(argv) {
  const startedAt = Date.now();
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) args[argv[i]] = argv[i + 1] ?? '';
  }
  const outDir = path.resolve(args['--out-dir'] ?? MEMBERS_DIR);
  const fail = (stage, msg) => {
    console.error(`❌ [${stage}] ${msg}`);
    console.error(`⏱ 管线终止于 ${((Date.now() - startedAt) / 1000).toFixed(1)}s（未产出）`);
    process.exit(1);
  };

  // ---- 闸 0：角色卡结构 ----
  let card;
  try {
    card = JSON.parse(fs.readFileSync(args['--card'], 'utf8'));
  } catch (e) {
    fail('角色卡', `读取/解析失败——${e.message}`);
  }
  const costar = card.costar ?? {};
  for (const [key, value] of [
    ['id', card.id], ['name', card.name], ['enName', card.enName], ['role', card.role],
    ['layer', card.layer], ['pillar', card.pillar], ['number', card.number],
    ['costar.objective', costar.objective], ['costar.audience', costar.audience],
  ]) {
    if (!value) fail('角色卡', `缺必需字段 ${key}（CO-STAR 五要素 + 挂靠支柱 + 技能清单）`);
  }
  if (!card.id.startsWith('member-')) fail('角色卡', `id 必须以 member- 开头（当前 ${card.id}）`);
  if (!LAYER_NAMES[card.layer]) fail('角色卡', `layer 必须为 L2..L9（当前 ${card.layer}）`);
  if (!PILLARS.has(card.pillar)) fail('角色卡', `pillar 挂靠必须为 自|知|学|治|愈（当前 ${card.pillar}）`);
  if (!/^\d{2}$/.test(String(card.number))) fail('角色卡', `number 必须两位数字（当前 ${card.number}）`);
  if (!Array.isArray(card.skills) || card.skills.length === 0) fail('角色卡', 'skills 独有技能清单不可为空');

  // ---- 闸 1：人格红线（八人格定数不可稀释） ----
  const identityText = [card.name, card.role, card.enName, ...Object.values(costar)].filter(Boolean).join(' ');
  const hit = FAMILY_IDENTITY.find((token) => identityText.includes(token));
  if (hit) fail('人格红线', `命中家族核心身份「${hit}」——八人格定数不可稀释；裂变对象限边缘执行成员（换名号/职务后重试）`);

  // ---- 闸 2：技能查重（家族 manifest 45 技能 + skills/ 目录全量） ----
  const manifestText = manifestSkillSlugs();
  for (const skill of card.skills) {
    if (!/^[a-z0-9-]+\.[a-z0-9-]+$/.test(skill.slug)) fail('技能查重', `技能 slug 非法（${skill.slug} · 形如 edge.domain-execute）`);
    if (manifestText.includes(skill.slug)) fail('技能查重', `技能 ${skill.slug} 与家族清单重复——边缘成员只能携带独有技能`);
    const ownerDir = path.join(ROOT, 'skills');
    try {
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const abs = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(abs);
          else if (entry.name === 'SKILL.md' && fs.readFileSync(abs, 'utf8').includes(`id: ${skill.slug}`)) {
            fail('技能查重', `技能 ${skill.slug} 与 skills/ 产物重复`);
          }
        }
      };
      walk(ownerDir);
    } catch { /* 无 skills 目录 */ }
  }

  // ---- 产出：模板目录（身份参数派生）+ 成员 manifest + 自含 agent-card + CO-STAR 定制段 ----
  const group = groupOfLayer(card.layer);
  const targetDir = path.resolve(outDir, group, card.id);
  if (!targetDir.startsWith(outDir + path.sep)) fail('产出', '输出越界');
  if (fs.existsSync(targetDir)) fail('产出', `目标已存在，禁止覆盖——${targetDir}`);

  const identity = {
    id: card.id,
    name: card.name,
    enName: card.enName,
    role: card.role,
    layer: card.layer,
    number: String(card.number),
    group,
    hotline: card.hotline ?? '0379-0000',
    color: card.color ?? '#8aa1b3',
    motto: card.motto ?? '边缘执行 · 就地尽责',
  };
  identity.layerName = LAYER_NAMES[card.layer];
  identity.roleEn = card.enName;
  generateInto(targetDir, identity);

  // 成员 manifest（自含清单：不碰家族主 manifest 45 条契约面）
  const manifestLines = [
    '# 成员清单（E2a 裂变管线产出 · 自含——不入家族主 manifest）',
    `id: ${card.id}`,
    `name: ${card.name}`,
    `role: ${card.role}`,
    `pillar: ${card.pillar}`,
    'costar:',
    `  context: ${costar.context ?? ''}`,
    `  objective: ${costar.objective}`,
    `  style: ${costar.style ?? '简洁结构化'}`,
    `  tone: ${costar.tone ?? '平实'}`,
    `  audience: ${costar.audience}`,
    'skills:',
  ];
  for (const skill of card.skills) manifestLines.push(`  - slug: ${skill.slug}`, `    description: ${skill.description ?? ''}`);
  fs.writeFileSync(path.join(targetDir, 'member-manifest.yaml'), `${manifestLines.join('\n')}\n`);

  // 自含 agent-card（A2A 卡最小形态）
  fs.writeFileSync(
    path.join(targetDir, 'agent-card.json'),
    `${JSON.stringify({
      name: card.name,
      description: `${card.role}（${card.pillar} 支柱挂靠 · E2a 边缘执行成员）`,
      url: '',
      version: '1.0.0',
      skills: card.skills.map((s) => ({ id: s.slug, name: s.slug, description: s.description ?? '' })),
    }, null, 2)}\n`,
  );

  // CO-STAR 定制段（追加 system-prompt.md——入册时该文件进成员限定白名单）
  const promptFile = path.join(targetDir, 'system-prompt.md');
  fs.appendFileSync(promptFile, [
    '',
    '---',
    '',
    '## CO-STAR 角色卡（E2a 管线注入）',
    '',
    `- **C 背景**：${costar.context ?? '（未提供）'}`,
    `- **O 目标**：${costar.objective}`,
    `- **S 风格**：${costar.style ?? '简洁结构化'}`,
    `- **T 语气**：${costar.tone ?? '平实'}`,
    `- **A 受众**：${costar.audience}`,
    `- **挂靠支柱**：${card.pillar}（行为契约由 pillar-contracts 门禁守护）`,
    `- **独有技能**：${card.skills.map((s) => s.slug).join(' · ')}`,
    `- **模型档位**：\${LLM_STEP_TIER:-flagship}（env 占位 · 强推理位拍板后回填）`,
    '',
  ].join('\n'),
  );

  // ---- 闸 3：局部零漂移（管线确定性自证：模板重生成与产出逐字节一致 · 定制三件豁免） ----
  const regenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-scaffold-'));
  const exempt = new Set(['system-prompt.md', 'member-manifest.yaml', 'agent-card.json']);
  try {
    generateInto(regenDir, identity);
    const listFiles = (dir) => {
      const out = [];
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const abs = path.join(d, e.name);
          if (e.isDirectory()) walk(abs);
          else out.push(abs);
        }
      };
      walk(dir);
      return out;
    };
    for (const regenFile of listFiles(regenDir)) {
      const rel = path.relative(regenDir, regenFile);
      const relPosix3 = toPosix(rel);
      if (exempt.has(relPosix3)) continue; // 定制三件（模板生成后管线叠加——比对豁免、存在性由本闸孤儿检查守
      const produced = path.join(targetDir, rel);
      if (!fs.existsSync(produced)) fail('零漂移', `产物缺 ${relPosix3}`);
      if (!fs.readFileSync(regenFile).equals(fs.readFileSync(produced))) fail('零漂移', `产物漂移 ${relPosix3}`);
    }
    for (const producedFile of listFiles(targetDir)) {
      const rel = toPosix(path.relative(targetDir, producedFile));
      if (exempt.has(rel)) continue;
      if (!fs.existsSync(path.join(regenDir, rel))) fail('零漂移', `产物孤儿文件 ${rel}`);
    }
  } finally {
    fs.rmSync(regenDir, { recursive: true, force: true });
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`✅ [全绿] 裂变产出：${card.name}（${card.id} · ${group} · 挂靠${card.pillar}）`);
  console.log(`   目录：${path.relative(ROOT, targetDir)}（模板 + member-manifest + agent-card + CO-STAR 定制段）`);
  console.log(`   技能：${card.skills.map((s) => s.slug).join(' · ')}（独有 · 查重过）`);
  console.log(`⏱ 管线耗时 ${seconds}s（门禁 ≤600s：四闸全过——角色卡结构 / 人格红线 / 技能查重 / 零漂移）`);
  console.log('入册提示：DRIFT_WHITELIST 增成员限定三条（system-prompt.md / member-manifest.yaml / agent-card.json）后 pnpm member:check 全绿');
}

/* ------------------------------------------------------------------ */

const mode = process.argv[2];
if (mode === 'check') checkMode();
else if (mode === 'create') createMode(process.argv.slice(3));
else if (mode === 'scaffold') scaffoldMode(process.argv.slice(3));
else {
  console.error('用法：node scripts/create-member.mjs create <flags> | scaffold --card <角色卡.json> | check');
  process.exit(1);
}
