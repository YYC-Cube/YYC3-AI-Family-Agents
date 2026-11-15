// @ts-nocheck
/**
 * P1 分发面契约（p1-distribution）—— B4 插件装配 + C1 模板脚手架 + C2 内核消费样板。
 *
 * 验收：
 *   D1 插件装配：9 技能 · plugin.json name 合规（^[a-z0-9][a-z0-9._-]{0,127}$）· 版本随根
 *   D2 插件组件齐备：skills 声明与磁盘组件一致（主技能 references/ + 8 成员 SKILL.md）
 *   D3 插件零漂移：--check 通过（装配产物与源一致）
 *   D4 C1 模板：copyTemplate 文件齐备 · 幂等覆盖（静态隔离目录）
 *   D5 C2 样板：import 说明符 ⊆ 内核包 exports（自 pack-npm.mjs 源提取，防漂移）
 *
 * 运行：tsc 编译 + node（进程内直调 exported core——零子进程；静态目录字面量）。
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

const ROOT = process.cwd();
const PLUGIN_OUT = '/tmp/yyc3-plugin-check'; // 静态字面量隔离目录（测试面，非派生路径）
const TEMPLATE_OUT = '/tmp/yyc3-family-app-check';

const GEN_PLUGIN_URL = pathToFileURL(path.join(ROOT, 'scripts', 'gen-plugin.mjs')).href;
const CREATE_APP_URL = pathToFileURL(path.join(ROOT, 'scripts', 'create-family-app.mjs')).href;

const TESTS = [
  {
    name: 'D1 插件装配：9 技能 · name 合规 · 版本随根',
    fn: async () => {
      const mod = await import(GEN_PLUGIN_URL);
      const { files, skills, version } = mod.assemblePlugin(ROOT, PLUGIN_OUT);
      assertEq(skills.length, 9, '技能数（1 主 + 8 成员）');
      const pkgVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
      assertEq(version, pkgVersion, '插件版本随根');
      const pluginJson = JSON.parse(files.get('.zcode-plugin/plugin.json'));
      assert(/^[a-z0-9][a-z0-9._-]{0,127}$/.test(pluginJson.name), '插件名合规');
      assertEq(pluginJson.name, 'yyc3-family', '插件名');
      assertEq(JSON.stringify(pluginJson.skills), JSON.stringify(skills), 'skills 声明一致');
      assert(files.get('marketplace.json'), 'marketplace.json 存在');
    },
  },
  {
    name: 'D2 插件组件齐备：主技能 references/ + 8 成员 SKILL.md',
    fn: async () => {
      const mod = await import(GEN_PLUGIN_URL);
      const { files, skills } = mod.assemblePlugin(ROOT, PLUGIN_OUT);
      for (const skill of skills) {
        assert(files.get(`${skill}/SKILL.md`), `${skill}/SKILL.md 存在`);
      }
      assert(files.get('yyc3-ai-family-coding/references/agents.md'), '主技能 references 入组件');
      assert(files.get('yyc3-ai-family-coding/references/standards.md'), '主技能 standards 入组件');
    },
  },
  {
    name: 'D3 插件零漂移：装配后 --check 通过',
    fn: async () => {
      const mod = await import(GEN_PLUGIN_URL);
      // 先装配到静态目录，再校验（process.cwd 为仓根——out 覆盖）
      const code = mod.runCli(['--out', PLUGIN_OUT]);
      assertEq(code, 0, '装配 exit 0');
      assertEq(mod.runCli(['--check', '--out', PLUGIN_OUT]), 0, '零漂移校验');
    },
  },
  {
    name: 'D4 C1 模板：copyTemplate 文件齐备 · 幂等覆盖（静态隔离目录）',
    fn: async () => {
      const mod = await import(CREATE_APP_URL);
      const copied = mod.copyTemplate(ROOT, TEMPLATE_OUT);
      assert(copied.includes('package.json'), '模板 package.json');
      assert(copied.includes('README.md'), '模板 README');
      assert(copied.includes('.env.example'), '模板 .env.example');
      const pkg = JSON.parse(fs.readFileSync(path.join(TEMPLATE_OUT, 'package.json'), 'utf8'));
      assert(pkg.dependencies && pkg.dependencies['@yyc3/ai-family-agent'], '模板依赖声明');
      const again = mod.copyTemplate(ROOT, TEMPLATE_OUT); // 幂等覆盖
      assertEq(again.length, copied.length, '幂等覆盖');
      // 越界拒绝：目标在 cwd 外且无 --allow-outside → exit 1
      assertEq(mod.runCli(['/tmp/yyc3-family-app-outside']), 1, '越界拒绝');
    },
  },
  {
    name: 'D5 C2 样板：import 说明符 ⊆ 内核包 exports（自 pack-npm 源提取）',
    fn: async () => {
      const mainSrc = fs.readFileSync(path.join(ROOT, 'examples', 'embedded-kernel', 'src', 'main.ts'), 'utf8');
      const imports = [...mainSrc.matchAll(/from '@yyc3\/ai-family-kernel\/([^']+)'/g)].map((m) => `./${m[1]}`);
      assertEq(imports.length, 2, '样板 import 数（runtime-assembly + family-metrics）');
      const packSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'pack-npm.mjs'), 'utf8');
      const exportKeys = new Set([...packSrc.matchAll(/'(\.\/[a-z0-9-]+)':\s*'\.\/dist/g)].map((m) => m[1]));
      for (const imp of imports) {
        assert(exportKeys.has(imp), `${imp} 在 kernel exports 面内`);
      }
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
  fs.rmSync(PLUGIN_OUT, { recursive: true, force: true });
  fs.rmSync(TEMPLATE_OUT, { recursive: true, force: true });
  console.log(`\n结果：${passed} 通过 / ${failures.length} 失败 / 共 ${TESTS.length} 例`);
  if (failures.length > 0) process.exit(1);
})();
