// @ts-nocheck
/**
 * 技能产物契约测试（skill-artifacts.contract）—— P3-T2。
 * 门禁映射：`skills/{owner}/{slug}/SKILL.md` 由 `presets/family-manifest.yaml` 生成，
 *           frontmatter（name/description/version/id/scope/owner）与清单零漂移；无孤儿产物。
 * 设计：调用真实校验脚本（零依赖、不联网、check 模式不写盘），断言其 JSON 结论与磁盘事实。
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCRIPT = 'scripts/gen-skill-artifacts.mjs';

/** 从混合输出中提取 JSON（构建环境可能注入调试日志）。 */
function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`未找到 JSON 输出：${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1));
}

const run = spawnSync(process.execPath, [SCRIPT, '--check', '--json'], { cwd: ROOT, encoding: 'utf8' });
const report = extractJson(run.stdout ?? '');

/** 解析 SKILL.md frontmatter 为对象（简单 key: value 行解析）。 */
function parseFrontmatter(rel) {
  const src = readFileSync(path.join(ROOT, rel), 'utf8');
  if (!src.startsWith('---\n')) throw new Error(`${rel} 缺少 frontmatter`);
  const end = src.indexOf('\n---\n', 4);
  if (end < 0) throw new Error(`${rel} frontmatter 未闭合`);
  const meta = {};
  for (const line of src.slice(4, end).split('\n')) {
    const m = line.match(/^([a-z]+): (.*)$/);
    if (m) meta[m[1]] = m[2];
  }
  return meta;
}

/** 从清单直接读取技能 id 清单（避免 YAML 解析，用生成脚本的推导做交叉验证）。 */
const manifestSkills = [];
{
  const yaml = readFileSync(path.join(ROOT, 'presets/family-manifest.yaml'), 'utf8');
  const section = yaml.slice(yaml.indexOf('\nskills:\n'), yaml.indexOf('\nprompts:\n'));
  for (const m of section.matchAll(/- id: ([a-z0-9]+\.[a-z0-9-]+)\n\s+version: "(\d+\.\d+\.\d+)"\n\s+scope: ([a-z]+)/g)) {
    manifestSkills.push({ id: m[1], scope: m[3], version: m[2] });
  }
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
  });
}

describe('技能产物契约（P3-T2）', () => {
  it('校验脚本以 0 退出', () => {
    globalThis.expect(run.status).toBe(0);
  });

  it('45 条技能产物、0 过期、0 孤儿', () => {
    globalThis.expect(report.ok).toBe(true);
    globalThis.expect(report.skills).toBe(45);
    globalThis.expect(report.staleFiles.length).toBe(0);
    globalThis.expect(report.orphans.length).toBe(0);
  });

  it('清单抽取出 45 条且版本全部语义化', () => {
    globalThis.expect(manifestSkills.length).toBe(45);
    for (const s of manifestSkills) {
      if (!/^\d+\.\d+\.\d+$/.test(s.version)) throw new Error(`版本不合规：${s.id}=${s.version}`);
    }
  });

  it('目录命名空间与技能 id 双向一致（45/45）', () => {
    globalThis.expect(manifestSkills.length).toBe(45);
    for (const s of manifestSkills) {
      const [prefix, slug] = s.id.split('.');
      const rel = `skills/${prefix}/${slug}/SKILL.md`;
      if (!existsSync(path.join(ROOT, rel))) throw new Error(`缺少产物：${rel}`);
      const meta = parseFrontmatter(rel);
      globalThis.expect(meta.id).toBe(s.id);
      globalThis.expect(meta.scope).toBe(s.scope);
    }
  });

  it('frontmatter 版本与清单零漂移（45/45）', () => {
    for (const s of manifestSkills) {
      const [prefix, slug] = s.id.split('.');
      const meta = parseFrontmatter(`skills/${prefix}/${slug}/SKILL.md`);
      globalThis.expect(meta.version).toBe(s.version);
    }
  });

  it('专用技能 owner=家人 slug，共用技能 owner=shared', () => {
    for (const s of manifestSkills) {
      const [prefix, slug] = s.id.split('.');
      const meta = parseFrontmatter(`skills/${prefix}/${slug}/SKILL.md`);
      if (s.scope === 'shared') {
        globalThis.expect(meta.owner).toBe('shared');
      } else {
        if (meta.owner === 'shared') throw new Error(`专用技能 owner 误为 shared：${s.id}`);
        if (!/^[a-z0-9-]+$/.test(meta.owner)) throw new Error(`owner 非 slug 形态：${s.id}=${meta.owner}`);
      }
    }
  });

  it('name/description 非空且 kernel 锚点信息未丢失（抽查全量）', () => {
    for (const s of manifestSkills) {
      const [prefix, slug] = s.id.split('.');
      const rel = `skills/${prefix}/${slug}/SKILL.md`;
      const meta = parseFrontmatter(rel);
      if (!meta.name || !meta.description) throw new Error(`name/description 缺失：${s.id}`);
    }
    // kernel 锚点存在性由 manifest:check 强校验，这里验证正文未丢失锚点行
    for (const s of manifestSkills) {
      const [prefix, slug] = s.id.split('.');
      const src = readFileSync(path.join(ROOT, `skills/${prefix}/${slug}/SKILL.md`), 'utf8');
      if (!src.includes('实现锚点（kernel）')) throw new Error(`正文缺锚点行：${s.id}`);
    }
  });

  it('步骤契约：45 条均有非空 steps 节，且 I/O 节与 kernel 锚点一一对应（P3-T1②）', () => {
    let withKernel = 0;
    for (const s of manifestSkills) {
      const [prefix, slug] = s.id.split('.');
      const src = readFileSync(path.join(ROOT, `skills/${prefix}/${slug}/SKILL.md`), 'utf8');
      const section = src.slice(src.indexOf('## 步骤（steps）'), src.indexOf('## 示例'));
      const stepLines = [...section.matchAll(/^\d+\. \S.+$/gm)];
      if (stepLines.length === 0) throw new Error(`步骤节为空：${s.id}`);
      const noKernel = src.includes('（纯描述，暂无锚点）');
      const hasIo = src.includes('## I/O 契约');
      if (noKernel && hasIo) throw new Error(`纯描述技能不应有 I/O 契约：${s.id}`);
      if (!noKernel) {
        withKernel += 1;
        if (!hasIo) throw new Error(`有锚点技能缺 I/O 契约：${s.id}`);
      }
    }
    // 13 共用 + 8 专用带 kernel = 21 条补 io
    globalThis.expect(withKernel).toBe(21);
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
