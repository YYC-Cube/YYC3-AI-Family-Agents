// @ts-nocheck
/**
 * 能力包打包 CLI 契约测试（pack-plugins.contract）—— P4-T6。
 * 门禁映射：生成物可入 Git（确定性 ZIP · 同输入恒同字节）；
 *   CI 零漂移（--check 字节级比对）；完整性联动（篡改内容拒绝打包，P4-T4）。
 * 设计：spawnSync 真实 CLI（--check --json / --root 虚拟环境），
 *   与磁盘产物、packaging 源目录交叉验证。
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const SCRIPT = 'scripts/pack-plugin.mjs';
const GOLDEN = 'assets/packs/family-core-1.0.0.skill';
const COPY = 'docs/yyc3-ai-family-coding.skill';
const COPY_SLUG = 'yyc3-ai-family-coding';
const GOLDEN_REFS = [
  'shared.self-judge', 'shared.memory-retrieve', 'shared.memory-write', 'shared.intent-route',
  'shared.experience-reflow', 'shared.skill-consolidate', 'shared.policy-check', 'shared.compliance-audit',
  'shared.fault-heal', 'shared.llm-invoke', 'shared.observe-emit', 'shared.mcp-tool', 'shared.a2a-delegate',
];

function run(args) {
  const res = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`未找到 JSON 输出：${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1));
}

/** 构造虚拟 root（presets + plugins + skills/shared），供篡改 / 确定性用例隔离运行。 */
function makeTempRoot() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'yyc3-pack-'));
  cpSync(path.join(ROOT, 'presets'), path.join(tmp, 'presets'), { recursive: true });
  cpSync(path.join(ROOT, 'plugins'), path.join(tmp, 'plugins'), { recursive: true });
  cpSync(path.join(ROOT, 'skills/shared'), path.join(tmp, 'skills/shared'), { recursive: true });
  return tmp;
}

const checked = run(['--check', '--json']);
const report = extractJson(checked.stdout);
const goldenPack = report.packs.find((p) => p.id === 'family-core');
const copyPack = report.packs.find((p) => p.id === COPY_SLUG);

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

describe('能力包打包 CLI 契约（P4-T6）', () => {
  it('--check --json 以 0 退出：能力包 + 分发副本两产物零漂移', () => {
    globalThis.expect(checked.status).toBe(0);
    globalThis.expect(report.ok).toBeTruthy();
    globalThis.expect(report.mode).toBe('check');
    globalThis.expect(report.errors.length).toBe(0);
    globalThis.expect(report.stale.length).toBe(0);
    globalThis.expect(report.packs.length).toBe(2);
    globalThis.expect(goldenPack.version).toBe('1.0.0');
    globalThis.expect(goldenPack.output).toBe(GOLDEN);
    globalThis.expect(copyPack.output).toBe(COPY);
    globalThis.expect(existsSync(path.join(ROOT, GOLDEN))).toBeTruthy();
  });

  it('产物条目清单：能力包 = plugin.yaml + 13 SKILL.md；分发副本 = 源目录 3 文件', () => {
    const paths = goldenPack.entries.map((e) => e.path);
    globalThis.expect(paths.length).toBe(14);
    globalThis.expect(paths[0]).toBe('family-core/plugin.yaml');
    for (const ref of GOLDEN_REFS) {
      const [, slug] = ref.split('.');
      if (!paths.includes(`family-core/skills/shared/${slug}/SKILL.md`)) throw new Error(`产物缺技能条目：${ref}`);
    }
    if (paths.some((p) => !p.startsWith('family-core/'))) throw new Error('产物条目越出包根目录');
    const copyPaths = copyPack.entries.map((e) => e.path).sort().join(',');
    const srcFiles = (() => {
      const walk = (dir, prefix) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]);
      return walk(path.join(ROOT, `packaging/${COPY_SLUG}`), `${COPY_SLUG}/`).sort().join(',');
    })();
    globalThis.expect(copyPaths).toBe(srcFiles);
    const skillMd = readFileSync(path.join(ROOT, `packaging/${COPY_SLUG}/SKILL.md`), 'utf8');
    if (!skillMd.startsWith('---\n') || !skillMd.includes('\nname: yyc3-ai-family-coding\n')) {
      throw new Error('分发副本 SKILL.md frontmatter 锚点漂移');
    }
  });

  it('完整性联动：正常虚拟 root 可打包；篡改技能内容即拒绝打包（P4-T4）', () => {
    const tmp = makeTempRoot();
    const okRun = run(['--json', '--root', tmp]);
    if (okRun.status !== 0) throw new Error(`正常虚拟 root 打包失败：${okRun.stdout}\n${okRun.stderr}`);
    const victim = path.join(tmp, 'skills/shared/self-judge/SKILL.md');
    writeFileSync(victim, `${readFileSync(victim, 'utf8')}<!-- 篡改 -->\n`, 'utf8');
    const tampered = extractJson(run(['--json', '--root', tmp]).stdout);
    globalThis.expect(tampered.ok).toBeFalsy();
    const msg = tampered.errors.join('\n');
    if (!msg.includes('完整性校验失败')) throw new Error('篡改未被完整性校验拦截');
    if (!msg.includes('拒绝打包')) throw new Error('错误信息未声明拒绝打包');
  });

  it('确定性：同一虚拟 root 连续两次打包，产物字节逐字节一致', () => {
    const tmp = makeTempRoot();
    run(['--json', '--root', tmp]);
    const first = readFileSync(path.join(tmp, GOLDEN));
    run(['--json', '--root', tmp]);
    const second = readFileSync(path.join(tmp, GOLDEN));
    globalThis.expect(first.equals(second)).toBeTruthy();
  });

  it('幂等：仓库根重复打包不改变产物字节，随后 --check 仍零漂移', () => {
    const before = readFileSync(path.join(ROOT, GOLDEN));
    const again = run(['--json']);
    globalThis.expect(again.status).toBe(0);
    globalThis.expect(extractJson(again.stdout).ok).toBeTruthy();
    globalThis.expect(readFileSync(path.join(ROOT, GOLDEN)).equals(before)).toBeTruthy();
    const recheck = run(['--check', '--json']);
    globalThis.expect(recheck.status).toBe(0);
    globalThis.expect(extractJson(recheck.stdout).stale.length).toBe(0);
  });

  it('入库产物被篡改可检出：单字节翻转 → --check exit 1 且报字节漂移', () => {
    const tmp = makeTempRoot();
    const packed = run(['--json', '--root', tmp]);
    globalThis.expect(packed.status).toBe(0);
    // 夹具改写仅限临时根目录内（路径包含守卫，防御性收窄写入面）
    const rootDir = path.resolve(tmp);
    const artifact = path.resolve(rootDir, GOLDEN);
    if (!artifact.startsWith(rootDir + path.sep)) throw new Error('夹具写入越界（意外路径穿越）');
    const raw = readFileSync(artifact);
    raw[raw.length - 1] = raw[raw.length - 1] ^ 0xff;
    writeFileSync(artifact, raw);
    const drifted = extractJson(run(['--check', '--json', '--root', tmp]).stdout);
    globalThis.expect(drifted.ok).toBeFalsy();
    globalThis.expect(drifted.stale.some((s) => s.includes('字节漂移'))).toBeTruthy();
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
