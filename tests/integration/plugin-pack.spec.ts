// @ts-nocheck
/**
 * 能力包打包分发闭环测试（plugin-pack）—— P4-T6。
 * 门禁映射：生成物可入 Git（确定性 ZIP 可解包 · 内容同源）；
 *   分发形态下完整性依然成立（kernel 权威实现交叉，P4-T4）；
 *   打包 → 分发 → 注册全链路（产物清单可被 PluginLoader 静态注册）；
 *   产物 id 与准入治理衔接（P4-T3）。
 */

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';

import {
  CapabilityAllowlist,
  PluginLoader,
  verifyPluginDigest,
} from '../../architecture-kernel/10-能力注册中心/index.js';

const ROOT = process.cwd();
const GOLDEN_FILE = 'assets/packs/family-core-1.0.0.skill';
const COPY_FILE = 'docs/yyc3-ai-family-coding.skill';
const COPY_SLUG = 'yyc3-ai-family-coding';
const GOLDEN_REFS = [
  'shared.self-judge', 'shared.memory-retrieve', 'shared.memory-write', 'shared.intent-route',
  'shared.experience-reflow', 'shared.skill-consolidate', 'shared.policy-check', 'shared.compliance-audit',
  'shared.fault-heal', 'shared.llm-invoke', 'shared.observe-emit', 'shared.mcp-tool', 'shared.a2a-delegate',
];

/** 自产确定性 ZIP 的最小解包器（deflate/stored · 无 zip64/加密）。 */
function unzipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP EOCD 缺失');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('central directory 签名错误');
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const usize = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf8');
    const dataStart = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
    const raw = buf.slice(dataStart, dataStart + csize);
    const data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    if (data.length !== usize) throw new Error(`解包长度不符：${name}`);
    entries.set(name, data);
    off += 46 + nameLen + extraLen + commentLen;
  }
  if (entries.size !== count) throw new Error('条目数与 EOCD 声明不符');
  return entries;
}

const GOLDEN = unzipEntries(readFileSync(path.join(ROOT, GOLDEN_FILE)));
const COPY = unzipEntries(readFileSync(path.join(ROOT, COPY_FILE)));

/** 从产物内 plugin.yaml 文本零依赖解析（正则同 P4-T5 套件范式）。 */
function parsePackagedYaml() {
  const text = GOLDEN.get('family-core/plugin.yaml').toString('utf8');
  const sectionOf = (type) => {
    const start = text.indexOf(`type: ${type}`);
    if (start < 0) return '';
    const next = text.indexOf('type:', start + 1);
    const end = text.indexOf('integrity:', start + 1);
    return text.slice(start + type.length + 6, Math.min(next < 0 ? Infinity : next, end < 0 ? Infinity : end));
  };
  return {
    text,
    id: text.match(/^id: (.+)$/m)[1],
    version: text.match(/^version: "?([^"\n]+)"?$/m)[1],
    scope: text.match(/^scope: (.+)$/m)[1],
    digest: text.match(/digest: "?([0-9a-f]{64})"?/)[1],
    refs: [...text.matchAll(/- ([a-z0-9]+\.[a-z0-9-]+)\n/g)].map((m) => m[1]),
    declaredOf: (type) => [...sectionOf(type).matchAll(/- (.+)\n/g)].map((m) => m[1]),
  };
}

const PACKAGED = parsePackagedYaml();

/** 产物解包内容 → canonical 摘要输入（skills payload = SKILL.md 内容；声明类 payload = ref 本身）。 */
function packagedDigestEntries() {
  const entries = GOLDEN_REFS.map((ref) => {
    const [, slug] = ref.split('.');
    return { kind: 'skills', ref, payload: GOLDEN.get(`family-core/skills/shared/${slug}/SKILL.md`).toString('utf8') };
  });
  for (const type of ['mcp-servers', 'policies']) {
    for (const ref of PACKAGED.declaredOf(type)) entries.push({ kind: type, ref, payload: ref });
  }
  return entries;
}

// ---------- 零依赖 harness（输出汇总行供门禁解析） ----------

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
  });
}

describe('能力包打包分发闭环（P4-T6）', () => {
  it('产物可解包：14 条目 · 命名契约（文件名 ≡ id-version · 根目录 ≡ id）· 与仓库源逐字节一致', () => {
    globalThis.expect(GOLDEN.size).toBe(14);
    if (!/^assets\/packs\/family-core-1\.0\.0\.skill$/.test(GOLDEN_FILE)) throw new Error('产物文件名违背 {id}-{version}.skill 契约');
    for (const [name] of GOLDEN) {
      if (!name.startsWith(`${PACKAGED.id}/`)) throw new Error(`条目越出包根目录：${name}`);
    }
    globalThis.expect(GOLDEN.get('family-core/plugin.yaml').equals(readFileSync(path.join(ROOT, 'plugins/family-core/plugin.yaml')))).toBeTruthy();
    for (const ref of GOLDEN_REFS) {
      const [, slug] = ref.split('.');
      const rel = `family-core/skills/shared/${slug}/SKILL.md`;
      globalThis.expect(GOLDEN.get(rel).equals(readFileSync(path.join(ROOT, 'skills/shared', slug, 'SKILL.md')))).toBeTruthy();
    }
  });

  it('分发形态完整性：解包内容构造 entries（含声明类）→ kernel verifyPluginDigest 通过（双实现交叉）', () => {
    globalThis.expect(verifyPluginDigest(packagedDigestEntries(), { algorithm: 'sha256', digest: PACKAGED.digest })).toBeTruthy();
  });

  it('打包 → 分发 → 注册全链路：产物清单可被 PluginLoader 静态注册且 15 能力同源', () => {
    const loader = new PluginLoader();
    loader.register({
      id: PACKAGED.id,
      version: PACKAGED.version,
      scope: PACKAGED.scope,
      contents: [
        { type: 'skills', refs: PACKAGED.refs },
        { type: 'mcp-servers', refs: PACKAGED.declaredOf('mcp-servers') },
        { type: 'policies', refs: PACKAGED.declaredOf('policies') },
      ],
    });
    const manifest = loader.get('family-core');
    if (!manifest) throw new Error('注册后查询不到 family-core');
    globalThis.expect(manifest.version).toBe('1.0.0');
    globalThis.expect(manifest.scope).toBe('builtin');
    globalThis.expect(manifest.contents[0].refs.length).toBe(13);
    globalThis.expect([...manifest.contents[0].refs].sort().join(',')).toBe([...GOLDEN_REFS].sort().join(','));
    globalThis.expect(loader.capabilities().length).toBe(15);
  });

  it('分发副本同受管：docs .skill 解包 3 条目与 packaging 源逐字节一致', () => {
    globalThis.expect(COPY.size).toBe(3);
    for (const rel of [`${COPY_SLUG}/SKILL.md`, `${COPY_SLUG}/references/agents.md`, `${COPY_SLUG}/references/standards.md`]) {
      globalThis.expect(COPY.get(rel).equals(readFileSync(path.join(ROOT, 'packaging', rel)))).toBeTruthy();
    }
  });

  it('篡改检出（分发形态）：产物内技能内容遭篡改 → kernel 完整性校验失败', () => {
    const entries = packagedDigestEntries();
    entries[0].payload = `${entries[0].payload}\n<!-- 伪造追加 -->\n`;
    globalThis.expect(verifyPluginDigest(entries, { algorithm: 'sha256', digest: PACKAGED.digest })).toBeFalsy();
  });

  it('产物 id 衔接准入治理：金包准入零噪声；未注册包 id observe 留痕、enforce 拒绝', () => {
    const observe = new CapabilityAllowlist({ mode: 'observe', allowed: ['family-core'] });
    const pass = observe.admit({ pluginId: PACKAGED.id, traceId: 'trace-pack', actor: 'qianxing' });
    globalThis.expect(pass.admitted).toBeTruthy();
    globalThis.expect(pass.audited).toBeFalsy();
    globalThis.expect(observe.observedCount).toBe(0);
    const shadow = observe.admit({ pluginId: 'shadow-pack', traceId: 'trace-pack', actor: 'qianxing' });
    globalThis.expect(shadow.admitted).toBeTruthy();
    globalThis.expect(shadow.audited).toBeTruthy();
    globalThis.expect(observe.observedCount).toBe(1);
    globalThis.expect(observe.verifyAudit()).toBeTruthy();
    const enforce = new CapabilityAllowlist({ mode: 'enforce', allowed: ['family-core'] });
    globalThis.expect(enforce.admit({ pluginId: 'shadow-pack', traceId: 'trace-pack', actor: 'qianxing' }).admitted).toBeFalsy();
    globalThis.expect(enforce.rejectedCount).toBe(1);
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
  console.log(`结果：${passed} 通过 / ${failures.length} 失败 / ${queue.length - passed - failures.length} 跳过 / 共 ${queue.length} 例`);
  if (failures.length > 0) process.exit(1);
})();
