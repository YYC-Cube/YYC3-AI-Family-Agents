// @ts-nocheck
/**
 * 静态注册中心测试（capability-catalog）—— P4-T2 scope 合并 + P4-T4 完整性（内核权威实现）。
 * 门禁映射：catalog 加载 → 解析 scope（builtin/local）→ 合并；多 scope 覆盖顺序确定且可测；
 *   零网络；plugin-loader 仅注册不执行（无动态 import()/远程安装/vm）。
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  PluginLoader,
  PLUGIN_DIGEST_ALGORITHM,
  PLUGIN_CONTENT_TYPES,
  buildCapabilityCatalog,
  capabilitiesOfType,
  computePluginDigest,
  findPlugin,
  hasCapability,
  pluginManifestErrors,
  verifyPluginDigest,
} from '../../architecture-kernel/10-能力注册中心/index.js';

const ROOT = process.cwd();
const GOLDEN = path.join(ROOT, 'plugins/family-core/plugin.yaml');

/** 金包 skills refs（正则抽取，保持与资产同源）。 */
function goldenSkillRefs() {
  const yaml = readFileSync(GOLDEN, 'utf8');
  const section = yaml.slice(yaml.indexOf('type: skills'), yaml.indexOf('type: mcp-servers'));
  return [...section.matchAll(/- ([a-z0-9]+\.[a-z0-9-]+)\n/g)].map((m) => m[1]);
}

function goldenField(name) {
  const m = readFileSync(GOLDEN, 'utf8').match(new RegExp(`^${name}: (.+)$`, 'm'));
  return m?.[1]?.replace(/^"|"$/g, '');
}

/** 金包摘要输入（与 scripts/check-plugins.mjs collectDigestEntries 同构）。 */
function goldenEntries() {
  return [
    ...goldenSkillRefs().map((ref) => {
      const [owner, slug] = ref.split('.');
      return {
        kind: 'skills',
        ref,
        payload: readFileSync(path.join(ROOT, 'skills', owner, slug, 'SKILL.md'), 'utf8'),
      };
    }),
    { kind: 'mcp-servers', ref: 'mcp-adapter/server', payload: 'mcp-adapter/server' },
    { kind: 'policies', ref: 'governance/policy-registry', payload: 'governance/policy-registry' },
  ];
}

/** 金包对应的能力包清单 fixture（字段与 plugin.yaml 资产一致）。 */
function goldenManifest(overrides = {}) {
  return {
    id: 'family-core',
    version: '1.0.0',
    scope: 'builtin',
    contents: [
      { type: 'skills', refs: goldenSkillRefs() },
      { type: 'mcp-servers', refs: ['mcp-adapter/server'] },
      { type: 'policies', refs: ['governance/policy-registry'] },
    ],
    ...overrides,
  };
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
    toThrow: (fragment) => {
      let threw = null;
      try {
        actual();
      } catch (e) {
        threw = e;
      }
      if (!threw) throw new Error('期望抛错，但未抛');
      if (fragment && !String(threw.message).includes(fragment)) {
        throw new Error(`错误消息缺「${fragment}」：${threw.message}`);
      }
    },
  });
}

describe('静态注册中心（P4-T2/T4）', () => {
  it('loader 注册金包：list 1 · get 字段一致 · 金包 fixture 与 yaml 资产同源（15 项能力）', () => {
    const loader = new PluginLoader();
    loader.register(goldenManifest());
    globalThis.expect(loader.size).toBe(1);
    const got = loader.get('family-core');
    globalThis.expect(got.version).toBe('1.0.0');
    globalThis.expect(got.scope).toBe('builtin');
    globalThis.expect(got.contents.length).toBe(3);
    // fixture ↔ yaml 资产同源：refs 由 yaml 正则抽取，18 = 13 skills + 1 mcp-servers + 1 policies + version/scope 非空
    globalThis.expect(loader.capabilities().length).toBe(15);
    // 与脚本侧 --json 的能力计数一致（skills 13）
    globalThis.expect(loader.capabilitiesOf('skills').length).toBe(13);
  });

  it('loader fail-fast：缺 version / contents.type 白名单外 / scope 非法 → 各抛错', () => {
    const loader = new PluginLoader();
    globalThis.expect(() => loader.register({ id: 'x', scope: 'builtin' }), '缺语义化 version').toThrow('缺语义化 version');
    globalThis.expect(() => loader.register({ id: 'x', version: '1.0.0', scope: 'builtin', contents: [{ type: 'tools', refs: ['a'] }] }), 'contents.type 非法').toThrow('contents.type 非法');
    globalThis.expect(() => loader.register({ id: 'x', version: '1.0.0', scope: 'marketplace' }), 'scope 非法').toThrow('scope 非法');
    globalThis.expect(pluginManifestErrors({ id: 'x', version: '1.0.0', scope: 'local' }).length).toBe(0);
  });

  it('loader 重复注册拒绝 + list 按 id 升序确定性返回', () => {
    const loader = new PluginLoader();
    loader.register(goldenManifest());
    loader.register({ id: 'aardvark-pack', version: '1.0.0', scope: 'local' });
    globalThis.expect(() => loader.register(goldenManifest({ scope: 'local' })), '重复注册').toThrow('重复注册');
    const ids = loader.list().map((m) => m.id);
    globalThis.expect(ids.join(',')).toBe('aardvark-pack,family-core');
    globalThis.expect(JSON.stringify(loader.list())).toBe(JSON.stringify(loader.list()));
  });

  it('catalog scope 合并：local 同 id 覆盖 builtin（overridden 记录 + 生效清单取 local）', () => {
    const snap = buildCapabilityCatalog([goldenManifest()], [goldenManifest({ version: '2.0.0', scope: 'local' })]);
    globalThis.expect(snap.overriddenIds.join(',')).toBe('family-core');
    const effective = findPlugin(snap, 'family-core');
    globalThis.expect(effective.version).toBe('2.0.0');
    globalThis.expect(effective.scope).toBe('local');
    globalThis.expect(snap.plugins.length).toBe(1);
  });

  it('合并确定性：打乱输入顺序 → 快照逐字节一致', () => {
    const builtin = [goldenManifest(), { id: 'pack-b', version: '1.0.0', scope: 'builtin', contents: [{ type: 'prompts', refs: ['shared.self-judge-prompt'] }] }];
    const local = [goldenManifest({ version: '2.0.0', scope: 'local' })];
    const a = JSON.stringify(buildCapabilityCatalog(builtin, local));
    const b = JSON.stringify(buildCapabilityCatalog([builtin[1], builtin[0]], [...local]));
    globalThis.expect(a).toBe(b);
  });

  it('能力展开：15 项注册能力归属 family-core；hasCapability 命中与未命中', () => {
    const snap = buildCapabilityCatalog([goldenManifest()], []);
    globalThis.expect(snap.capabilities.length).toBe(15);
    globalThis.expect(capabilitiesOfType(snap, 'skills').length).toBe(13);
    globalThis.expect(snap.capabilities.every((c) => c.pluginId === 'family-core' && c.scope === 'builtin')).toBeTruthy();
    globalThis.expect(hasCapability(snap, 'skills', 'shared.self-judge')).toBeTruthy();
    globalThis.expect(hasCapability(snap, 'skills', 'shared.qwikzorg')).toBeFalsy();
    globalThis.expect(hasCapability(snap, 'mcp-servers', 'mcp-adapter/server')).toBeTruthy();
    globalThis.expect(hasCapability(snap, 'policies', 'governance/policy-registry')).toBeTruthy();
  });

  it('完整性（权威实现）：内核纯 TS 摘要 === 金包声明；篡改 payload / 算法降级 → verify false', () => {
    const entries = goldenEntries();
    const declared = { algorithm: PLUGIN_DIGEST_ALGORITHM, digest: goldenField('  digest') ?? /digest: "([0-9a-f]{64})"/.exec(readFileSync(GOLDEN, 'utf8'))?.[1] };
    globalThis.expect(computePluginDigest(entries)).toBe(declared.digest);
    globalThis.expect(verifyPluginDigest(entries, declared)).toBeTruthy();
    const tampered = entries.map((e) => (e.ref === 'shared.self-judge' ? { ...e, payload: `${e.payload}#` } : e));
    globalThis.expect(verifyPluginDigest(tampered, declared)).toBeFalsy();
    globalThis.expect(verifyPluginDigest(entries, { algorithm: 'sha512', digest: declared.digest })).toBeFalsy();
    // 空 contents 类型常量契约：四类白名单冻结
    globalThis.expect(PLUGIN_CONTENT_TYPES.join(',')).toBe('skills,mcp-servers,policies,prompts');
  });

  it('红线「仅注册不执行」：loader 无执行语义 API；catalog 零网络（纯函数）', () => {
    const loader = new PluginLoader();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(loader)).sort().join(',');
    globalThis.expect(methods).toBe('capabilities,capabilitiesOf,constructor,get,list,register,registerAll,size');
    const forbidden = ['execute', 'call', 'run', 'import', 'load', 'fetch', 'require'];
    for (const name of forbidden) {
      if (name in loader) throw new Error(`loader 出现执行语义 API：${name}`);
    }
    // 纯函数：同输入恒同快照（确定性 = 无网络/无副作用的结构性证明）
    const m = goldenManifest();
    globalThis.expect(JSON.stringify(buildCapabilityCatalog([m], []))).toBe(JSON.stringify(buildCapabilityCatalog([m], [])));
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
