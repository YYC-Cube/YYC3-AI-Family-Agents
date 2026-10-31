// @ts-nocheck
/**
 * 裂变管线契约（fission-pipeline）—— M39 · E2a（演进集 v1.2.0 解冻第一波）。
 *
 * 验收：
 *   F1 人格红线负例：角色卡冒充家族核心（名号/职务命中）→ scaffold 拒绝且明示
 *   F2 技能查重负例：独有技能与家族清单重复 → scaffold 拒绝且明示
 *   F3 管线端到端（hermetic --out-dir）：合法角色卡 → 全绿产出（四闸 + 计时）·
 *      member-manifest（CO-STAR/pillar/skills）· 自含 agent-card · CO-STAR 定制段
 *   F4 试点在册：2 例试点目录 + 角色卡 JSON 入册 + member:check 覆盖全绿
 *
 * 运行：tsc 编译 + node（零依赖 harness，范式同 member-template.contract）。
 */

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
    toContain: (exp) => {
      if (!String(actual).includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${String(actual).slice(0, 300)}`);
    },
  });
}

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();

/** 根边界守卫（路径穿越红线）：解析目标强制不出根。 */
function safeJoin(root, relTarget) {
  const target = path.resolve(root, relTarget);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`路径越界（${relTarget} 越出 ${root}）`);
  }
  return target;
}

/** 跑 scaffold（返回 {status, text}；argv 数组构造非 spread）。 */
function runScaffold(cardPath, outDir) {
  const argv = ['scripts/create-member.mjs', 'scaffold', '--card', cardPath];
  if (outDir) argv.push('--out-dir', outDir);
  const r = spawnSync('node', argv, { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
  return { status: r.status ?? 1, text: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
}

function writeCard(dir, over) {
  const card = {
    id: 'member-tmp-probe',
    name: '试探·临时员',
    enName: 'TmpProbe',
    role: '临时探针（边缘）',
    layer: 'L5',
    number: '99',
    pillar: '治',
    costar: { objective: '验证管线', audience: '契约测试' },
    skills: [{ slug: 'edge.tmp-probe', description: '临时探针技能' }],
    ...over,
  };
  const file = path.join(dir, 'card.json');
  fs.writeFileSync(file, JSON.stringify(card));
  return file;
}

describe('裂变管线契约（M39 · E2a · 门禁全自动）', () => {
  it('F1 人格红线负例：冒充家族核心被拒且明示', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-fission-f1-'));
    const card = writeCard(dir, { name: '临时·言启·千行', role: '首席导航员（冒充测试）' });
    const r = runScaffold(card, dir);
    expect(r.status !== 0).toBeTruthy();
    expect(r.text).toContain('人格红线');
    expect(r.text).toContain('未产出');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('F2 技能查重负例：与家族清单重复被拒且明示', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-fission-f2-'));
    const card = writeCard(dir, {
      skills: [{ slug: 'qianhang.intent-detection', description: '与家族清单重复' }],
    });
    const r = runScaffold(card, dir);
    expect(r.status !== 0).toBeTruthy();
    expect(r.text).toContain('技能查重');
    expect(r.text).toContain('qianhang.intent-detection');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('F3 管线端到端：合法卡全绿产出（四闸 + 计时 + manifest/card/CO-STAR）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-fission-f3-'));
    const card = writeCard(dir);
    const r = runScaffold(card, dir);
    expect(r.status).toBe(0);
    expect(r.text).toContain('全绿');
    expect(r.text).toContain('管线耗时');
    const produced = safeJoin(dir, 'business-layer/member-tmp-probe');
    expect(fs.existsSync(safeJoin(produced, 'core/intent-classifier.service.ts'))).toBeTruthy();
    const manifest = fs.readFileSync(safeJoin(produced, 'member-manifest.yaml'), 'utf8');
    expect(manifest).toContain('pillar: 治');
    expect(manifest).toContain('objective: 验证管线');
    expect(manifest).toContain('slug: edge.tmp-probe');
    const agentCard = JSON.parse(fs.readFileSync(safeJoin(produced, 'agent-card.json'), 'utf8'));
    expect(agentCard.skills[0].id).toBe('edge.tmp-probe');
    const prompt = fs.readFileSync(safeJoin(produced, 'system-prompt.md'), 'utf8');
    expect(prompt).toContain('CO-STAR 角色卡（E2a 管线注入）');
    expect(prompt).toContain('挂靠支柱**：治');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('F4 试点在册：2 例目录 + 角色卡 JSON + member:check 全绿覆盖', () => {
    const groupOf = { 'member-edge-executor': 'business-layer', 'member-skill-patroller': 'core-layer' };
    for (const [id, group] of Object.entries(groupOf)) {
      const dir = safeJoin(ROOT, `family-agents/${group}/${id}`);
      expect(fs.existsSync(safeJoin(dir, 'member-manifest.yaml'))).toBeTruthy();
      expect(fs.existsSync(safeJoin(dir, 'agent-card.json'))).toBeTruthy();
      expect(fs.existsSync(safeJoin(ROOT, `presets/profiles/edge-cards/${id}.json`))).toBeTruthy();
      const manifest = fs.readFileSync(safeJoin(dir, 'member-manifest.yaml'), 'utf8');
      expect(manifest).toContain('pillar:');
      expect(manifest).toContain('slug: edge.');
    }
    const check = spawnSync('node', ['scripts/create-member.mjs', 'check'], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
    expect(check.status).toBe(0);
    expect(check.stdout).toContain('9 家人'); // 7 家人 + 2 试点（千行豁免）
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
  console.log(`\n结果：${passed} 通过 / ${failures.length} 失败 / 共 ${queue.length} 例`);
  if (failures.length > 0) process.exit(1);
})();
