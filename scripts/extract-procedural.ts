// @ts-nocheck
/**
 * Phase A 运行器：对全部家人的 system-prompt.md 跑规则提取器，
 * 产出各家人 procedural/rules-draft.yaml（初稿，status: draft）。
 *
 * 设计约束（§架构设计 v2.2.1/§6.4）：
 *   - 幂等：同输入 → 同输出，可重复执行；
 *   - 安全：只写 `rules-draft.yaml`，**永不触碰**已确权的 `intent-rules.yaml`；
 *   - 可审计：初稿保留 provenance（source:line）与原文 raw。
 *
 * 用法：
 *   node extract-procedural.js <家人实现集根目录>
 *   （缺省 = <repo>/03-家人Agent实现集）
 *
 * 注：仓库零依赖（无 @types/node），故采用仓内既定 @ts-nocheck 垫片风格（同 tests/*）。
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractRules } from '../03-家人Agent实现集/shared-core/memory-framework/procedural-memory/prompt-rule-extractor.js';

/** YAML 标量安全序列化（JSON 字符串是合法 YAML 双引号标量）。 */
const y = (v: unknown): string => JSON.stringify(v);

/** 从 prompt 首行 `# XXX · 系统提示词` 提取中文名。 */
function memberName(promptText: string): string {
  const m = promptText.match(/^#\s*(.+?)\s*·\s*系统提示词/m);
  return m ? m[1]!.trim() : '未知家人';
}

/** 组装单家人初稿 YAML（含确权流程注释）。 */
function renderDraft(
  dirName: string,
  name: string,
  promptText: string,
  today: string,
): string {
  const r = extractRules(promptText, { source: 'system-prompt.md' });
  const lines: string[] = [
    `# ${name} · 程序记忆条目初稿（Phase A 自动提取）`,
    `# 生成器: prompt-rule-extractor | 提取时间: ${today} | 状态: draft（待家族确权）`,
    `# 确权流程: 对照既有 procedural/intent-rules.yaml → 采纳/修订/驳回 → 《架构设计.md》§8.3 留痕`,
    `# ⚠️ 本文件为生成物（可重复运行 scripts/extract-procedural 重建）；人工修订请写入 intent-rules.yaml`,
    'meta:',
    `  member: ${y(dirName)}`,
    `  name: ${y(name)}`,
    `  source: ${y('system-prompt.md')}`,
    `  generator: ${y('prompt-rule-extractor')}`,
    `  extracted_at: ${y(today)}`,
    `  version: ${y('0.1.0-draft')}`,
    `  stats: { entries: ${r.entries.length}, workflows: ${r.workflows.length}, ignored_lines: ${r.ignoredLines} }`,
    'entries:',
  ];
  if (r.entries.length === 0) lines.push('  []');
  for (const e of r.entries) {
    lines.push(
      `  - id: ${y(e.id)}`,
      `    kind: ${y(e.kind)}`,
      `    salience: ${e.salience}`,
      `    provenance: ${y(`${e.provenance.source}:${e.provenance.line}`)}`,
      `    statement: ${y(e.statement)}`,
      `    raw: ${y(e.raw)}`,
    );
  }
  lines.push('workflows:');
  if (r.workflows.length === 0) lines.push('  []');
  for (const w of r.workflows) {
    lines.push(
      `  - id: ${y(w.id)}`,
      `    name: ${y(w.name)}`,
      `    version: ${y(w.version)}`,
      `    provenance: ${y(`${w.provenance.source}:${w.provenance.line}`)}`,
      '    steps:',
    );
    for (const s of w.steps) {
      lines.push(`      - { order: ${s.order}, action: ${y(s.action)} }`);
    }
  }
  return lines.join('\n') + '\n';
}

function main(): void {
  // 缺省以 CWD 为仓库根（约定从仓库根运行），argv[2] 可显式指定家人实现集目录。
  const base = process.argv[2] ?? join(process.cwd(), '03-家人Agent实现集');
  // 本地（Asia/Shanghai）日期，避免 UTC 偏差（如 UTC 10-16 vs 本地 10-17）。
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());

  const groups = ['business-layer', 'core-layer'];
  const rows: string[] = ['家人目录                          | entries | workflows | ignored | 产物'];
  rows.push('-'.repeat(78));
  let totalE = 0;
  let totalW = 0;

  for (const g of groups) {
    const gdir = join(base, g);
    if (!existsSync(gdir)) continue;
    for (const dir of readdirSync(gdir).filter((d: string) => d.startsWith('member-')).sort()) {
      const promptPath = join(gdir, dir, 'system-prompt.md');
      if (!existsSync(promptPath)) {
        rows.push(`${dir.padEnd(34)}| ${'-'.padStart(7)} | ${'-'.padStart(9)} | ${'-'.padStart(7)} | 缺 system-prompt.md`);
        continue;
      }
      const promptText = readFileSync(promptPath, 'utf8');
      const r = extractRules(promptText, { source: 'system-prompt.md' });
      const outPath = join(gdir, dir, 'procedural', 'rules-draft.yaml');
      writeFileSync(outPath, renderDraft(dir, memberName(promptText), promptText, today), 'utf8');
      totalE += r.entries.length;
      totalW += r.workflows.length;
      rows.push(
        `${dir.padEnd(34)}| ${String(r.entries.length).padStart(7)} | ${String(r.workflows.length).padStart(9)} | ${String(r.ignoredLines).padStart(7)} | procedural/rules-draft.yaml`,
      );
    }
  }
  console.log(rows.join('\n'));
  console.log(`\n合计：entries=${totalE}, workflows=${totalW}；初稿 status=draft，确权文件 intent-rules.yaml 未触碰。`);
}

main();
