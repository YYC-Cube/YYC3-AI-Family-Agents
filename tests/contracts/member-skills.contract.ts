// @ts-nocheck
/**
 * 成员技能视图契约（member-skills）—— P1-B3 · Skills 形态成员技能组。
 *
 * 验收：
 *   M1 生成 8 员技能：packaging/member-skills/<slug>/SKILL.md ×8 · frontmatter name = yyc3-<slug>
 *   M2 人格单一事实源：每员技能清单 = manifest 中 owner 编号的技能集合（无遗漏无串门）
 *   M3 零漂移：--check 通过 · 篡改检出（exit 1）· 重生成恢复
 *   M4 主技能独立：yyc3-ai-family-coding 与成员技能无碰撞
 *
 * 运行：tsc 编译 + node（进程内直调 generateMemberSkills/runCli——零子进程，范式同 install-family-mcp）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function assertEq(actual, exp, label) {
  if (actual !== exp) throw new Error(`${label ?? ''}：期望 ${JSON.stringify(exp)}，实际 ${JSON.stringify(actual)}`);
}

const SCRIPT_URL = pathToFileURL(path.join(process.cwd(), 'scripts', 'gen-member-skills.mjs')).href;

const TESTS = [
  {
    name: 'M1 生成 8 员技能：文件齐备 · frontmatter name = yyc3-<slug>',
    fn: async () => {
      const mod = await import(SCRIPT_URL);
      const { members, files } = mod.generateMemberSkills(process.cwd());
      assertEq(members.length, 8, '成员数');
      assertEq(files.size, 8, '文件数');
      for (const m of members) {
        const content = files.get(`packaging/member-skills/${m.slug}/SKILL.md`);
        assert(content, `${m.slug} 产物存在`);
        assert(content.startsWith(`---\nname: yyc3-${m.slug}\n`), `${m.slug} frontmatter name`);
        assert(content.includes(`description: ${m.meta['名号']}`), `${m.slug} description 含名号`);
      }
    },
  },
  {
    name: 'M2 人格单一事实源：技能归属 = manifest owner 编号（无遗漏无串门）',
    fn: async () => {
      const mod = await import(SCRIPT_URL);
      const { parseYaml } = await import(pathToFileURL(path.join(process.cwd(), 'scripts', 'lib', 'yaml-lite.mjs')).href);
      const { members, files } = mod.generateMemberSkills(process.cwd());
      const manifest = parseYaml(fs.readFileSync(path.join(process.cwd(), 'presets', 'family-manifest.yaml'), 'utf8'));
      for (const m of members) {
        const expected = manifest.skills
          .filter((s) => String(s.owner) === m.id)
          .map((s) => String(s.id))
          .sort();
        const content = files.get(`packaging/member-skills/${m.slug}/SKILL.md`);
        const got = [...content.matchAll(/`([a-z0-9.-]+)`（v/g)].map((x) => x[1]).sort();
        assertEq(JSON.stringify(got), JSON.stringify(expected), `${m.slug} 技能归属`);
      }
    },
  },
  {
    name: 'M3 零漂移：--check 通过 · 篡改检出 exit 1 · 重生成恢复',
    fn: async () => {
      const mod = await import(SCRIPT_URL);
      assertEq(mod.runCli(['--check']), 0, 'check 通过（当前产物与源一致）');
      const target = path.join(process.cwd(), 'packaging', 'member-skills', 'qianhang', 'SKILL.md');
      const original = fs.readFileSync(target, 'utf8');
      fs.writeFileSync(target, `${original}\n<!-- tampered -->\n`);
      try {
        assertEq(mod.runCli(['--check']), 1, '篡改检出 exit 1');
      } finally {
        fs.writeFileSync(target, original); // 恢复
      }
      assertEq(mod.runCli(['--check']), 0, '恢复后 check 通过');
    },
  },
  {
    name: 'M4 主技能独立：yyc3-ai-family-coding 与成员技能无碰撞',
    fn: async () => {
      const main = path.join(process.cwd(), 'packaging', 'yyc3-ai-family-coding', 'SKILL.md');
      assert(fs.existsSync(main), '主技能源存在');
      const mainText = fs.readFileSync(main, 'utf8');
      assert(mainText.startsWith('---\nname: yyc3-ai-family-coding\n'), '主技能 name 不冲突');
      const members = fs.readdirSync(path.join(process.cwd(), 'packaging', 'member-skills'));
      assertEq(members.length, 8, '成员技能目录数');
    },
  },
];

(async () => {
  let passed = 0;
  const failures = [];
  for (const t of TESTS) {
    try {
      await t.fn();
      passed += 1;
      console.log(`PASS ${t.name}`);
    } catch (e) {
      failures.push(t.name);
      console.log(`FAIL ${t.name}\n      ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\n结果：${passed} 通过 / ${failures.length} 失败 / 共 ${TESTS.length} 例`);
  if (failures.length > 0) process.exit(1);
})();
