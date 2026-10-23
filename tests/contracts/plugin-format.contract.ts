// @ts-nocheck
/**
 * 能力包格式契约（plugin-format.contract）—— P4-T1 格式 + P4-T4 完整性。
 * 门禁映射：plugins/{id}/plugin.yaml schema 契约 + 内容篡改检测 + 双实现摘要交叉一致。
 * 设计：spawnSync 真实校验脚本（node:crypto 实现）与内核 integrity.ts（纯 TS 实现）
 *       交叉断言——两实现同输入恒同摘要，单边被篡改即门禁失败。
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const CHECK = path.join(ROOT, 'scripts/check-plugins.mjs');
const KERNEL_INTEGRITY = path.join(ROOT, 'architecture-kernel/10-能力注册中心/integrity.ts');
const GOLDEN = path.join(ROOT, 'plugins/family-core/plugin.yaml');
const GOLDEN_DIR = path.join(ROOT, 'plugins/family-core');

/** 以 --json 调用真实校验脚本。 */
function runCheck(options = {}) {
  const args = [CHECK, '--json'];
  if (options.root) args.push('--root', options.root);
  if (options.pluginsDir) args.push('--plugins-dir', options.pluginsDir);
  const probe = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  return { status: probe.status, report: extractJson(probe.stdout ?? '') };
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`未找到 JSON 输出：${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1));
}

/** 从金包 yaml 抽取 skills refs（清单交叉验证用）。 */
function goldenSkillRefs() {
  const yaml = readFileSync(GOLDEN, 'utf8');
  const section = yaml.slice(yaml.indexOf('type: skills'), yaml.indexOf('type: mcp-servers'));
  return [...section.matchAll(/- ([a-z0-9]+\.[a-z0-9-]+)\n/g)].map((m) => m[1]);
}

function goldenDigest() {
  return readFileSync(GOLDEN, 'utf8').match(/digest: "([0-9a-f]{64})"/)?.[1];
}

/** 构造内核 integrity 摘要输入（与脚本 collectDigestEntries 同构）。 */
function buildGoldenEntries(root = ROOT, overrides = {}) {
  const refs = goldenSkillRefs();
  const entries = refs.map((ref) => {
    const [owner, slug] = ref.split('.');
    return {
      kind: 'skills',
      ref,
      payload: overrides[ref] ?? readFileSync(path.join(root, 'skills', owner, slug, 'SKILL.md'), 'utf8'),
    };
  });
  entries.push({ kind: 'mcp-servers', ref: 'mcp-adapter/server', payload: 'mcp-adapter/server' });
  entries.push({ kind: 'policies', ref: 'governance/policy-registry', payload: 'governance/policy-registry' });
  return entries;
}

// ---------- 零依赖 harness ----------

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

describe('能力包格式契约（P4-T1/T4）', () => {
  it('校验脚本对金包零错误退出（ok=true · plugins=1 · 声明=实算）', () => {
    const { status, report } = runCheck();
    globalThis.expect(status).toBe(0);
    globalThis.expect(report.ok).toBeTruthy();
    globalThis.expect(report.plugins).toBe(1);
    const pkg = report.packages[0];
    globalThis.expect(pkg.id).toBe('family-core');
    globalThis.expect(pkg.scope).toBe('builtin');
    globalThis.expect(pkg.skills).toBe(13);
    globalThis.expect(pkg.declaredDigest).toBe(pkg.computedDigest);
  });

  it('金包结构字段完备（id/version/scope/description/contents 四类白名单内/integrity/targets）', () => {
    const yaml = readFileSync(GOLDEN, 'utf8');
    for (const field of ['id:', 'version:', 'scope:', 'description:', 'contents:', 'integrity:', 'targets:']) {
      if (!yaml.includes(field)) throw new Error(`金包缺少字段：${field}`);
    }
    globalThis.expect(yaml.includes('type: skills')).toBeTruthy();
    globalThis.expect(yaml.includes('type: mcp-servers')).toBeTruthy();
    globalThis.expect(yaml.includes('type: policies')).toBeTruthy();
    if (/type:\s*(?!skills|mcp-servers|policies|prompts)[a-z-]+/.test(yaml)) throw new Error('金包出现四类白名单之外的 contents.type');
    globalThis.expect(yaml.includes('algorithm: sha256')).toBeTruthy();
    globalThis.expect(yaml.includes('agents: ["*"]')).toBeTruthy();
  });

  it('skills refs 与清单交叉零漂移（13 条共用技能全部存在于 manifest）', () => {
    const refs = goldenSkillRefs();
    globalThis.expect(refs.length).toBe(13);
    const yaml = readFileSync(path.join(ROOT, 'presets/family-manifest.yaml'), 'utf8');
    for (const ref of refs) {
      if (!yaml.includes(`- id: ${ref}\n`)) throw new Error(`金包引用不存在于清单：${ref}`);
    }
  });

  it('内核纯 TS SHA-256 ≡ node:crypto 实现（同输入恒同摘要 · 交叉断言）', () => {
    const entries = buildGoldenEntries();
    const probe = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { computePluginDigest } from ${JSON.stringify(pathToFileURL(KERNEL_INTEGRITY).href)};
const entries = ${JSON.stringify(entries)};
process.stdout.write(computePluginDigest(entries));`,
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );
    if (probe.status !== 0) throw new Error(`内核摘要计算失败：${probe.stderr?.slice(0, 200)}`);
    const kernelDigest = (probe.stdout ?? '').trim().slice(-64);
    globalThis.expect(kernelDigest).toBe(goldenDigest());
    const { report } = runCheck();
    globalThis.expect(report.packages[0].declaredDigest).toBe(kernelDigest);
  });

  it('篡改检测 A：声明 digest 被改一位 → 校验失败（exit 1 · 完整性错误）', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'yyc3-plugin-a-'));
    try {
      const tamperedDir = path.join(tmp, 'family-core');
      mkdirSync(tamperedDir, { recursive: true });
      const yaml = readFileSync(GOLDEN, 'utf8').replace(/digest: "([0-9a-f])/, 'digest: "0');
      if (yaml === readFileSync(GOLDEN, 'utf8')) throw new Error('篡改替换未生效');
      writeFileSync(path.join(tamperedDir, 'plugin.yaml'), yaml);
      const { status, report } = runCheck({ pluginsDir: tmp });
      globalThis.expect(status).toBe(1);
      globalThis.expect(report.ok).toBeFalsy();
      if (!report.errors.some((e) => e.includes('完整性校验失败'))) throw new Error(`错误缺完整性关键词：${JSON.stringify(report.errors)}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('篡改检测 B：SKILL.md 内容被改一字 → 虚拟 root 下校验失败', () => {
    const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'yyc3-plugin-b-'));
    try {
      // 虚拟 root：清单 + 金包 + 13 个 SKILL.md
      mkdirSync(path.join(tmpRoot, 'presets'), { recursive: true });
      cpSync(path.join(ROOT, 'presets/family-manifest.yaml'), path.join(tmpRoot, 'presets/family-manifest.yaml'));
      cpSync(GOLDEN_DIR, path.join(tmpRoot, 'plugins/family-core'), { recursive: true });
      for (const ref of goldenSkillRefs()) {
        const [owner, slug] = ref.split('.');
        const dest = path.join(tmpRoot, 'skills', owner, slug);
        mkdirSync(dest, { recursive: true });
        cpSync(path.join(ROOT, 'skills', owner, slug, 'SKILL.md'), path.join(dest, 'SKILL.md'));
      }
      // 篡改一个 SKILL.md：追加一个字符
      const target = path.join(tmpRoot, 'skills/shared/self-judge/SKILL.md');
      writeFileSync(target, `${readFileSync(target, 'utf8')}#`);
      const { status, report } = runCheck({ root: tmpRoot });
      globalThis.expect(status).toBe(1);
      globalThis.expect(report.ok).toBeFalsy();
      if (!report.errors.some((e) => e.includes('完整性校验失败'))) throw new Error(`篡改未被检测：${JSON.stringify(report.errors)}`);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('坏包多重错误全捕获（四类白名单外的 type / 未知清单引用 / 未知家人 / scope 非法）', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'yyc3-plugin-c-'));
    try {
      const badDir = path.join(tmp, 'bad-pack');
      mkdirSync(badDir, { recursive: true });
      writeFileSync(
        path.join(badDir, 'plugin.yaml'),
        [
          'id: bad-pack',
          'version: "1.0.0"',
          'scope: marketplace',
          'contents:',
          '  - type: tools',
          '    refs:',
          '      - whatever',
          '  - type: skills',
          '    refs:',
          '      - not-in-manifest',
          'targets:',
          '  agents:',
          '    - whoami',
        ].join('\n'),
      );
      const { status, report } = runCheck({ pluginsDir: tmp });
      globalThis.expect(status).toBe(1);
      const joined = report.errors.join('\n');
      if (!joined.includes('contents.type 非法')) throw new Error('未捕获白名单外 type');
      if (!joined.includes('不存在于清单')) throw new Error('未捕获未知清单引用');
      if (!joined.includes('targets.agents 未知家人')) throw new Error('未捕获未知家人');
      if (!joined.includes('scope 非法')) throw new Error('未捕获 scope 非法');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('金包 digest 已由 scripts 侧 node:crypto 复算固定（--write-integrity 幂等）', () => {
    const before = readFileSync(GOLDEN, 'utf8');
    const rerun = spawnSync(process.execPath, [CHECK, '--write-integrity'], { cwd: ROOT, encoding: 'utf8' });
    globalThis.expect(rerun.status).toBe(0);
    const after = readFileSync(GOLDEN, 'utf8');
    globalThis.expect(after).toBe(before); // 幂等：重算回写不改变已正确的 digest
    globalThis.expect(existsSync(GOLDEN)).toBeTruthy();
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
