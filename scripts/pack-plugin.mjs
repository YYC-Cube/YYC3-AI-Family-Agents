#!/usr/bin/env node
/**
 * 能力包打包 CLI（pack-plugin）—— P4-T6。
 *
 * 职责：
 *   1. 能力包打包：plugins/{id}/plugin.yaml → assets/packs/{id}-{version}.skill（确定性 ZIP）。
 *      打包前重算 canonical digest 与 integrity.digest 比对（P4-T4 联动）——内容遭篡改即拒绝打包。
 *      包内布局：`{id}/plugin.yaml` + `{id}/skills/{owner}/{slug}/SKILL.md`（skills refs）
 *      + `{id}/{manifest.file}`（prompts refs）；mcp-servers / policies 为声明类，
 *      已由 plugin.yaml contents 表达，不产生额外文件。
 *   2. 分发副本打包：packaging/{slug}/ 源目录 → docs/{slug}.skill。
 *      （演进指导 §七：docs/yyc3-ai-family-coding.skill 定位为对外分发副本，由本 CLI 生成，不手改。）
 *   3. --check：重打包与磁盘产物字节级比对，零漂移不写盘（CI/回归用）。
 *
 * 确定性 ZIP（零依赖）：STORED 零压缩（跨 zlib 字节确定）+ 手写 crc32 / local header /
 *   central directory / EOCD；固定 DOS 时间戳（1980-01-01）、条目按路径字典序排序、
 *   UTF-8 文件名标志（0x0800）、无目录条目 / extra field / data descriptor——
 *   同输入恒同字节，产物可入 Git，CI 可零漂移校验。
 *
 * 用法：
 *   pnpm pack:plugins                # 打包全部并写盘
 *   pnpm pack:check                  # 零漂移校验（exit 0/1）
 *   pnpm pack:plugins -- --json     # JSON 结论供套件消费
 *   node scripts/pack-plugin.mjs --root <dir>   # 指定仓库根（篡改检测虚拟环境用）
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest } from './lib/family-manifest.mjs';
import { parseYaml } from './lib/yaml-lite.mjs';

const PACKS_OUT_DIR = 'assets/packs';
const COPIES_OUT_DIR = 'docs';
const PACKAGING_DIR = 'packaging';
const PLUGINS_DIR = 'plugins';
/** 固定 DOS 时间（1980-01-01 00:00:00）：date = (1<<5)|1 = 0x21，time = 0。 */
const DOS_TIME = 0;
const DOS_DATE = 0x21;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

/** 校验模式：只比对不写盘。 */
const CHECK_ONLY = hasFlag('check');
/** JSON 结论输出（供契约套件消费）。 */
const AS_JSON = hasFlag('json');
/** 仓库根覆盖（篡改检测构造虚拟 root 用）。 */
const ROOT_OVERRIDE = arg('root');

// ---------- 确定性 ZIP（零依赖） ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const u16 = (v) => Buffer.from([v & 0xff, (v >>> 8) & 0xff]);
const u32 = (v) => Buffer.from([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);

/**
 * 确定性打包：entries = [{ path, data: Buffer }]（调用方保证已按 path 排序且唯一）。
 * 返回 ZIP 字节（**STORED 零压缩** · 固定时间戳 · UTF-8 文件名标志）——
 * 不用 deflate：跨平台 zlib 版本的压缩字节不确定，会破「同输入恒同字节」CI 零漂移门禁。
 */
function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { path: p, data } of entries) {
    const name = Buffer.from(p, 'utf8');
    const crc = crc32(data);
    const stored = data;
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0),
      u16(DOS_TIME), u16(DOS_DATE), u32(crc),
      u32(stored.length), u32(data.length),
      u16(name.length), u16(0), name,
    ]);
    locals.push(local, stored);
    centrals.push(
      Buffer.concat([
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
        u16(DOS_TIME), u16(DOS_DATE), u32(crc),
        u32(stored.length), u32(data.length),
        u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
      ]),
    );
    offset += local.length + stored.length;
  }
  const central = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(central.length), u32(offset), u16(0),
  ]);
  return Buffer.concat([...locals, central, eocd]);
}

// ---------- 打包内容收集 ----------

/** 递归收集目录下全部文件的仓库相对路径（按路径字典序）。 */
function collectFiles(root, dir) {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    return e.isDirectory() ? collectFiles(root, rel) : [rel];
  }).sort();
}

/** 能力包 → ZIP 条目（{id}/plugin.yaml + 文件产物类内容；缺失/篡改记入 errors）。 */
function collectPluginEntries(root, manifest, plugin, errors) {
  const entries = [];
  const pluginDir = path.join(PLUGINS_DIR, plugin.id);
  entries.push({ path: `${plugin.id}/plugin.yaml`, data: readFileSync(path.join(root, pluginDir, 'plugin.yaml')) });
  const seen = new Set();
  for (const group of plugin.contents ?? []) {
    for (const ref of group.refs ?? []) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      if (group.type === 'skills') {
        const [owner, slug] = ref.split('.');
        const file = path.join('skills', owner, slug, 'SKILL.md');
        if (!existsSync(path.join(root, file))) {
          errors.push(`能力包 ${plugin.id} skills 引用产物缺失：${file}`);
          continue;
        }
        entries.push({ path: `${plugin.id}/${file.replaceAll(path.sep, '/')}`, data: readFileSync(path.join(root, file)) });
      } else if (group.type === 'prompts') {
        const entry = (manifest.prompts ?? []).find((p) => p.id === ref);
        if (!entry?.file) {
          errors.push(`能力包 ${plugin.id} prompts 引用 ${ref} 在清单中无 file 字段`);
          continue;
        }
        if (!existsSync(path.join(root, entry.file))) {
          errors.push(`能力包 ${plugin.id} prompts 引用产物缺失：${entry.file}`);
          continue;
        }
        entries.push({ path: `${plugin.id}/${entry.file.replaceAll(path.sep, '/')}`, data: readFileSync(path.join(root, entry.file)) });
      }
      // mcp-servers / policies 声明类：plugin.yaml contents 已表达，无实体文件。
    }
  }
  return entries;
}

// ---------- 主流程 ----------

const errors = [];
const packs = [];

const ROOT = ROOT_OVERRIDE ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = loadManifest(ROOT);

// 1) 能力包（plugins/*/plugin.yaml → assets/packs/{id}-{version}.skill）
const pluginsRoot = path.join(ROOT, PLUGINS_DIR);
const pluginDirs = existsSync(pluginsRoot)
  ? readdirSync(pluginsRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  : [];

for (const dir of pluginDirs) {
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
  if (!plugin.id || !/^\d+\.\d+\.\d+$/.test(plugin.version ?? '')) {
    errors.push(`能力包 ${dir} 缺 id 或语义化 version，无法命名产物`);
    continue;
  }

  // 完整性联动（P4-T4）：重算 canonical digest（与 check-plugins.mjs 同构），篡改即拒绝打包。
  const digestEntries = [];
  try {
    for (const group of plugin.contents ?? []) {
      for (const ref of group.refs ?? []) {
        let payload = ref;
        if (group.type === 'skills') {
          const [owner, slug] = ref.split('.');
          payload = readFileSync(path.join(ROOT, 'skills', owner, slug, 'SKILL.md'), 'utf8');
        } else if (group.type === 'prompts') {
          const entry = (manifest.prompts ?? []).find((p) => p.id === ref);
          if (!entry?.file) throw new Error(`prompts 引用 ${ref} 在清单中无 file 字段`);
          payload = readFileSync(path.join(ROOT, entry.file), 'utf8');
        }
        digestEntries.push({ kind: group.type, ref, payload });
      }
    }
    digestEntries.sort((a, b) => (a.kind === b.kind ? (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0) : a.kind < b.kind ? -1 : 1));
    const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
    const computed = sha256Hex(digestEntries.map((e) => sha256Hex(`${e.kind}\u0000${e.ref}\u0000${e.payload}`)).join('\n'));
    if (computed !== plugin.integrity?.digest) {
      errors.push(`能力包 ${plugin.id} 完整性校验失败：声明 ${(plugin.integrity?.digest ?? '<none>').slice(0, 12)}… ≠ 实算 ${computed.slice(0, 12)}…（拒绝打包，先执行 pnpm plugins:integrity）`);
      continue;
    }
  } catch (e) {
    errors.push(`能力包 ${plugin.id} 摘要输入收集失败：${e.message}`);
    continue;
  }

  const entries = collectPluginEntries(ROOT, manifest, plugin, errors);
  if (errors.length > 0) continue;
  const output = path.join(PACKS_OUT_DIR, `${plugin.id}-${plugin.version}.skill`);
  packs.push({ id: plugin.id, version: plugin.version, output, entries });
}

// 2) 分发副本（packaging/{slug}/ → docs/{slug}.skill）
const packagingRoot = path.join(ROOT, PACKAGING_DIR);
const copySlugs = existsSync(packagingRoot)
  ? readdirSync(packagingRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  : [];
for (const dir of copySlugs) {
  const files = collectFiles(ROOT, path.join(PACKAGING_DIR, dir));
  if (files.length === 0) {
    errors.push(`分发副本源目录为空：${PACKAGING_DIR}/${dir}`);
    continue;
  }
  packs.push({
    id: dir,
    version: null,
    output: path.join(COPIES_OUT_DIR, `${dir}.skill`),
    entries: files.map((rel) => ({
      path: rel.slice(PACKAGING_DIR.length + 1),
      data: readFileSync(path.join(ROOT, rel)),
    })),
  });
}

// 3) 打包（条目按路径排序去重）与零漂移比对
const stale = [];
for (const pack of packs) {
  const unique = new Map();
  for (const e of pack.entries) {
    if (unique.has(e.path)) errors.push(`产物 ${pack.output} 条目重复：${e.path}`);
    unique.set(e.path, e.data);
  }
  const entries = [...unique.entries()].map(([p, data]) => ({ path: p, data })).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const bytes = buildZip(entries);
  pack.bytes = bytes.length;
  pack.entryList = entries.map((e) => ({ path: e.path, bytes: e.data.length, crc32: crc32(e.data) }));
  const target = path.join(ROOT, pack.output);
  if (CHECK_ONLY) {
    if (!existsSync(target)) stale.push(`${pack.output}（缺失）`);
    else if (!bytes.equals(readFileSync(target))) stale.push(`${pack.output}（字节漂移）`);
  } else if (errors.length === 0) {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
}

const ok = errors.length === 0 && stale.length === 0;

if (AS_JSON) {
  console.log(JSON.stringify({
    ok,
    mode: CHECK_ONLY ? 'check' : 'write',
    packs: packs.map(({ id, version, output, bytes, entryList }) => ({ id, version, output, bytes, entries: entryList })),
    stale,
    errors,
  }, null, 2));
} else {
  console.log(`📦 能力包打包 CLI${CHECK_ONLY ? '零漂移校验' : ''}（P4-T6）`);
  for (const p of packs) {
    console.log(`   · ${p.output}（${p.bytes} B · ${p.entryList.length} 条目${p.version ? ` · v${p.version}` : ''}）`);
  }
  for (const s of stale) console.log(`   ⚠ ${s}`);
  for (const e of errors) console.log(`   ✗ ${e}`);
  console.log(ok ? (CHECK_ONLY ? '✅ 产物与源零漂移' : '✅ 打包完成，产物可入 Git') : '❌ 打包未通过');
}

process.exit(ok ? 0 : 1);
