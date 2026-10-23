#!/usr/bin/env node
/**
 * 能力包校验（check-plugins）—— P4-T1 格式契约 + P4-T4 完整性校验（零依赖）。
 *
 * 职责：
 *   1. 扫描 plugins/{id}/plugin.yaml，校验能力包格式契约：
 *      id/version/scope/description/contents[]/integrity/targets；
 *      contents.type 仅限 skills / mcp-servers / policies / prompts 四类；
 *      skills refs ⊆ manifest 技能集、prompts refs ⊆ manifest 提示词集；
 *      mcp-servers / policies 为声明类（内核锚点 slug，仅格式校验）。
 *   2. 完整性（P4-T4）：按确定性算法对包内容计算 SHA-256 摘要，与 integrity.digest
 *      声明比对——篡改即校验失败。算法与 kernel 10-能力注册中心 integrity.ts 同构
 *      （同输入恒同摘要），由 capability-catalog 契约套件做交叉断言。
 *   3. --write-integrity：重算 digest 回写 plugin.yaml（打包前身的规范化模式，P4-T6 CLI 化）。
 *
 * 摘要算法（canonical）：
 *   entries = contents 展开为 {kind, ref, payload}；skills/prompts 的 payload = 引用文件内容，
 *   mcp-servers/policies（声明类）的 payload = ref 字符串本身；
 *   按 (kind, ref) 字典序排序 → 逐项 sha256(`${kind}\u0000${ref}\u0000${payload}`) hex
 *   → 以 '\n' 连接 → 对连接串再取 sha256 hex 即 digest。
 *
 * 用法：
 *   pnpm plugins:check                 # 校验（exit 0/1）
 *   pnpm plugins:check -- --json      # JSON 结论供套件消费
 *   pnpm plugins:integrity             # 重算并回写各包 integrity.digest
 *   node scripts/check-plugins.mjs --plugins-dir <dir>   # 指定包目录（篡改检测用）
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest } from './lib/family-manifest.mjs';
import { parseYaml } from './lib/yaml-lite.mjs';

const PLUGINS_DIR = 'plugins';
const CONTENT_TYPES = ['skills', 'mcp-servers', 'policies', 'prompts'];
const SCOPES = ['builtin', 'local'];
/** 声明类引用（mcp-servers / policies）：内核锚点 slug，仅格式校验不做存在性检查。 */
const DECLARED_REF_RE = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

/** 生成模式：重算并回写各包 integrity.digest。 */
const WRITE_INTEGRITY = hasFlag('write-integrity');
/** 仓库根目录覆盖（篡改检测构造虚拟 root 用；默认脚本所在仓）。 */
const ROOT_OVERRIDE = arg('root');
/** 校验模式指定的包目录（默认 <root>/plugins）。 */
const PLUGINS_DIR_OVERRIDE = arg('plugins-dir');
/** JSON 结论输出（供契约套件消费）。 */
const AS_JSON = hasFlag('json');

const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** 能力包 contents → 摘要输入 entries（确定性：按 kind+ref 排序）。 */
function collectDigestEntries(root, manifest, plugin) {
  const entries = [];
  for (const group of plugin.contents ?? []) {
    for (const ref of group.refs ?? []) {
      let payload = ref; // 声明类：ref 本身参与摘要
      if (group.type === 'skills') {
        const [owner, slug] = ref.split('.');
        payload = readFileSync(path.join(root, 'skills', owner, slug, 'SKILL.md'), 'utf8');
      } else if (group.type === 'prompts') {
        const entry = (manifest.prompts ?? []).find((p) => p.id === ref);
        if (!entry?.file) throw new Error(`prompts 引用 ${ref} 在清单中无 file 字段`);
        payload = readFileSync(path.join(root, entry.file), 'utf8');
      }
      entries.push({ kind: group.type, ref, payload });
    }
  }
  entries.sort((a, b) => (a.kind === b.kind ? (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0) : a.kind < b.kind ? -1 : 1));
  return entries;
}

/** canonical 摘要（与 kernel integrity.ts 同构）。 */
function computePluginDigest(entries) {
  const lines = entries.map((e) => sha256Hex(`${e.kind}\u0000${e.ref}\u0000${e.payload}`));
  return sha256Hex(lines.join('\n'));
}

// ---------- 主流程 ----------

const errors = [];
const warnings = [];
const packages = [];

const ROOT = ROOT_OVERRIDE ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = loadManifest(ROOT);
const skillIds = new Set((manifest.skills ?? []).map((s) => s.id));
const promptIds = new Set((manifest.prompts ?? []).map((p) => p.id));
const agentSlugs = new Set((manifest.agents ?? []).map((a) => a.slug));

const pluginsRoot = PLUGINS_DIR_OVERRIDE ?? path.join(ROOT, PLUGINS_DIR);
const dirs = existsSync(pluginsRoot)
  ? readdirSync(pluginsRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  : [];

if (dirs.length === 0 && !PLUGINS_DIR_OVERRIDE) {
  warnings.push(`未发现能力包目录：${PLUGINS_DIR}/（P4-T1 后应至少存在一个金包）`);
}

for (const dir of dirs) {
  const file = path.join(pluginsRoot, dir, 'plugin.yaml');
  if (!existsSync(file)) {
    errors.push(`能力包目录缺 plugin.yaml：${dir}`);
    continue;
  }
  let plugin;
  try {
    plugin = parseYaml(readFileSync(file, 'utf8'));
  } catch (e) {
    errors.push(`plugin.yaml 解析失败（${dir}）：${e.message}`);
    continue;
  }

  // 1) 结构契约
  if (!plugin.id) errors.push(`能力包 ${dir} 缺 id`);
  else if (!/^[a-z0-9][a-z0-9-]*$/.test(plugin.id)) errors.push(`能力包 id 命名不合规：${plugin.id}`);
  else if (plugin.id !== dir) errors.push(`能力包目录名与 id 不一致：${dir} ≠ ${plugin.id}`);
  if (!/^\d+\.\d+\.\d+$/.test(plugin.version ?? '')) errors.push(`能力包 ${dir} 缺语义化 version`);
  if (!SCOPES.includes(plugin.scope)) errors.push(`能力包 ${dir} scope 非法：${plugin.scope}（仅 ${SCOPES.join('/')}）`);
  if (!plugin.description) errors.push(`能力包 ${dir} 缺 description`);

  // 2) contents 四类白名单 + refs 交叉
  const contents = plugin.contents ?? [];
  if (!Array.isArray(contents) || contents.length === 0) {
    errors.push(`能力包 ${dir} contents 缺失或为空`);
  } else {
    const seenRefs = new Set();
    for (const group of contents) {
      if (!CONTENT_TYPES.includes(group.type)) {
        errors.push(`能力包 ${dir} contents.type 非法：${group.type}（仅限 ${CONTENT_TYPES.join(' / ')}）`);
        continue;
      }
      const refs = group.refs ?? [];
      if (!Array.isArray(refs) || refs.length === 0) {
        errors.push(`能力包 ${dir} contents.${group.type} refs 缺失或为空`);
        continue;
      }
      for (const ref of refs) {
        if (seenRefs.has(ref)) errors.push(`能力包 ${dir} 存在重复引用：${ref}`);
        seenRefs.add(ref);
        if (group.type === 'skills') {
          if (!skillIds.has(ref)) errors.push(`能力包 ${dir} skills 引用不存在于清单：${ref}`);
        } else if (group.type === 'prompts') {
          if (!promptIds.has(ref)) errors.push(`能力包 ${dir} prompts 引用不存在于清单：${ref}`);
        } else if (!DECLARED_REF_RE.test(ref)) {
          errors.push(`能力包 ${dir} ${group.type} 声明引用格式不合规：${ref}`);
        }
      }
    }
  }

  // 3) targets
  const targets = plugin.targets ?? {};
  const agents = targets.agents ?? [];
  if (!Array.isArray(agents) || agents.length === 0) {
    errors.push(`能力包 ${dir} targets.agents 缺失或为空`);
  } else {
    for (const a of agents) {
      if (a !== '*' && !agentSlugs.has(a)) errors.push(`能力包 ${dir} targets.agents 未知家人：${a}`);
    }
  }

  // 4) integrity（P4-T4 完整性）
  if (plugin.integrity?.algorithm !== 'sha256') {
    errors.push(`能力包 ${dir} integrity.algorithm 必须为 sha256`);
  }
  const declaredDigest = plugin.integrity?.digest;
  if (!/^[0-9a-f]{64}$/.test(declaredDigest ?? '')) {
    errors.push(`能力包 ${dir} integrity.digest 缺失或非 64 位 hex`);
  }

  // 5) 重算摘要比对（引用文件缺失时记错并跳过比对）
  let computed = null;
  try {
    const entries = collectDigestEntries(ROOT, manifest, plugin);
    computed = computePluginDigest(entries);
    if (computed !== declaredDigest && !WRITE_INTEGRITY && /^[0-9a-f]{64}$/.test(declaredDigest ?? '')) {
      errors.push(`能力包 ${dir} 完整性校验失败：声明 ${declaredDigest?.slice(0, 12)}… ≠ 实算 ${computed.slice(0, 12)}…（内容遭篡改或 digest 过期）`);
    }
  } catch (e) {
    errors.push(`能力包 ${dir} 摘要输入收集失败：${e.message}`);
  }

  if (WRITE_INTEGRITY && computed) {
    const src = readFileSync(file, 'utf8');
    const updated = /digest: "?[0-9a-f]{64}"?/.test(src)
      ? src.replace(/digest: "?[0-9a-f]{64}"?/, `digest: "${computed}"`)
      : `${src.replace(/\s*$/, '')}\nintegrity:\n  algorithm: sha256\n  digest: "${computed}"\n`;
    writeFileSync(file, updated, 'utf8');
  }

  packages.push({
    id: plugin.id ?? dir,
    version: plugin.version,
    scope: plugin.scope,
    skills: (plugin.contents ?? []).find((g) => g.type === 'skills')?.refs?.length ?? 0,
    declaredDigest,
    computedDigest: computed,
  });
}

const ok = errors.length === 0;
const report = {
  ok,
  plugins: packages.length,
  overridden: [],
  errors,
  warnings,
  packages,
  writeIntegrity: WRITE_INTEGRITY,
};

if (AS_JSON) {
  console.log(JSON.stringify(report));
} else {
  console.log(`📦 能力包校验（plugins/ · P4-T1 格式 + P4-T4 完整性）`);
  console.log(`   能力包 ${packages.length} 个${packages.map((p) => `\n   · ${p.id}@${p.version}（${p.scope} · skills ${p.skills} · digest ${p.declaredDigest?.slice(0, 12)}…）`).join('')}`);
  for (const w of warnings) console.log(`   ⚠ ${w}`);
  for (const e of errors) console.log(`   ✗ ${e}`);
  console.log(ok ? '✅ 格式契约与完整性校验通过' : '❌ 存在错误');
}

process.exit(ok ? 0 : 1);
