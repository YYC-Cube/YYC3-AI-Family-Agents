// @ts-nocheck
/**
 * 家人模板脚手架契约（member-template）—— M33 · 复用路线 R4。
 *
 * 验收：
 *   T1 零漂移：check 模式 exit 0——7 位非千行家人按 agent.yaml 反解参数重生成，
 *      与 committed 树逐字节一致（演进文件白名单：prompts ×2 / rules-draft）
 *   T2 新家人生成：--out-dir 隔离输出——15+ 文件结构完整 · 身份替换到位（编号/热线/
 *      名号）· 模板说明 README 不入实例 · 无跨家人串扰
 *   T3 确定性：同参数两次生成逐字节一致
 *   T4 守卫：--layer 非法拒绝 · 已存在目标拒绝覆盖
 *
 * 运行：tsc 编译 + node（零依赖 harness，范式同 npm-pack.contract）。
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
    toBeFalsy: () => {
      if (actual) throw new Error(`期望假值，实际 ${JSON.stringify(actual)}`);
    },
    toContain: (exp) => {
      if (!actual.includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${String(actual).slice(0, 200)}`);
    },
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`期望长度 ${n}，实际 ${actual.length}`);
    },
    not: {
      toContain: (exp) => {
        if (String(actual).includes(exp)) throw new Error(`期望不含 ${JSON.stringify(exp)}，实际 ${String(actual).slice(0, 200)}`);
      },
    },
  });
}

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd(); // 门禁以仓库根为 cwd 运行套件（禁 import.meta 定位）

/** 递归收集文件相对路径。 */
function walkRel(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkRel(abs, base, out);
    else out.push(path.relative(base, abs));
  }
  return out;
}

/** 边界守卫：解析目标强制不出根（路径穿越红线）。 */
function safeJoin(root, relTarget) {
  const target = path.resolve(root, relTarget);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`路径越界（${relTarget} 越出 ${root}）`);
  }
  return target;
}

const BOLE_FLAGS = [
  '--id', 'member-bole', '--name', '千里·伯乐', '--en-name', 'Bole',
  '--role', '首席推荐官 · 知遇之人', '--layer', 'L2', '--number', '04',
  '--group', 'business-layer', '--hotline', '0379-0109', '--color', '#e67e22',
  '--motto', '「我知您之所需，荐您之所未识。」',
];

describe('家人模板脚手架契约（M33 · R4）', () => {
  it('T1 零漂移：check 模式 exit 0——7 家人重生成与 committed 逐字节一致', () => {
    try {
      execFileSync('node', ['scripts/create-member.mjs', 'check'], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      const detail = String((e && (e.stderr || e.stdout)) || e.message).slice(0, 300);
      throw new Error(`check 非零退出：${detail}`);
    }
  });

  it('T2 新家人生成：结构完整 · 身份替换到位 · 无跨家人串扰', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-member-create-'));
    execFileSync('node', ['scripts/create-member.mjs', 'create', ...BOLE_FLAGS, '--out-dir', out], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const memberDir = safeJoin(out, 'business-layer/member-bole');
    const rels = walkRel(memberDir);
    expect(rels.length >= 15).toBeTruthy(); // 14 ts + agent.yaml（README 模板说明不入实例）
    expect(fs.existsSync(path.join(memberDir, 'core', 'intent-classifier.service.ts'))).toBeTruthy();
    expect(fs.existsSync(path.join(memberDir, 'emotion', 'achievement-panel.ts'))).toBeTruthy();
    expect(fs.existsSync(path.join(memberDir, 'README.md'))).toBeFalsy();
    const agentYaml = fs.readFileSync(path.join(memberDir, 'agent.yaml'), 'utf8');
    expect(agentYaml).toContain('010301-04');
    expect(agentYaml).toContain('0379-0109');
    expect(agentYaml).toContain('千里·伯乐');
    const classifier = fs.readFileSync(path.join(memberDir, 'core', 'intent-classifier.service.ts'), 'utf8');
    expect(classifier).toContain('member-bole');
    expect(classifier).not.toContain('member-thinker');
    expect(classifier).not.toContain('{{');
    fs.rmSync(out, { recursive: true, force: true });
  });

  it('T3 确定性：同参数两次生成逐字节一致', () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-member-det-a-'));
    const b = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-member-det-b-'));
    for (const dir of [a, b]) {
      execFileSync('node', ['scripts/create-member.mjs', 'create', ...BOLE_FLAGS, '--out-dir', dir], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }
    const relsA = walkRel(path.join(a, 'business-layer/member-bole')).sort();
    const relsB = walkRel(path.join(b, 'business-layer/member-bole')).sort();
    expect(relsA.join('|')).toBe(relsB.join('|'));
    for (const rel of relsA) {
      expect(fs.readFileSync(safeJoin(a, `business-layer/member-bole/${rel}`)).equals(
        fs.readFileSync(safeJoin(b, `business-layer/member-bole/${rel}`)),
      )).toBeTruthy();
    }
    fs.rmSync(a, { recursive: true, force: true });
    fs.rmSync(b, { recursive: true, force: true });
  });

  it('T4 守卫：非法 --layer 拒绝 · 已存在目标拒绝覆盖', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'yyc3-member-guard-'));
    let badLayer = '';
    try {
      execFileSync('node', ['scripts/create-member.mjs', 'create', '--id', 'member-x', '--name', '试', '--en-name', 'X', '--role', 'r', '--layer', 'L99', '--number', '01', '--out-dir', out], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      badLayer = String(e.message);
    }
    expect(badLayer).toContain('Command failed'); // 非法层级被拒（非零退出）
    const preExisting = path.join(out, 'business-layer', 'member-bole');
    fs.mkdirSync(preExisting, { recursive: true });
    let occupied = '';
    try {
      execFileSync('node', ['scripts/create-member.mjs', 'create', ...BOLE_FLAGS, '--out-dir', out], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      occupied = String(e.message);
    }
    expect(occupied).toContain('Command failed'); // 已存在目标被拒（禁止覆盖）
    fs.rmSync(out, { recursive: true, force: true });
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
