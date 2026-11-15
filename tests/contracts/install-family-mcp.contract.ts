// @ts-nocheck
/**
 * 一键接入脚本契约（install-family-mcp）—— P0-A2 · host 接入摩擦治理。
 *
 * 验收：
 *   A2-1 --dry-run 不落盘（预演报告，配置字节不变）
 *   A2-2 --check 未接入 exit 2 · 注入后 exit 0（CI 判定面）
 *   A2-3 注入形态：ZCode → mcp.servers + environment 键 · Claude → mcpServers + env 键
 *        · 三闸 env 块正确 · 既有条目保留
 *   A2-4 幂等：二次安装不改写（字节级一致）
 *   A2-5 备份先行 + 密钥零落盘（仅占位串，无 Bearer/npm_/sk- 真值形态）
 *   A2-6 JSONC 宽容解析（注释/尾逗号/字符串内 // 不误伤）
 *
 * 运行：tsc 编译 + node（进程内直调脚本 runCli(argv, env)——零子进程；env 测试夹具
 *      YYC3_INSTALL_TEST=1 把宿主配置重定向到静态隔离目录，不触碰真实 ~/.zcode）。
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
function assertContains(actual, exp, label) {
  if (!String(actual).includes(exp)) throw new Error(`${label ?? ''}：期望包含 ${JSON.stringify(exp)}，实际 ${String(actual).slice(0, 300)}`);
}

const TMP = '/tmp/yyc3-install-home'; // 静态字面量隔离目录（测试面，非派生路径）
const ZCODE = '/tmp/yyc3-install-home/zcode-config.json';
const CLAUDE = '/tmp/yyc3-install-home/claude-config.json';

/** 目录边界守卫：解析目标并强制不出静态隔离目录（路径穿越红线）。 */
function safeJoinTmp(name) {
  const target = path.resolve(TMP, name);
  if (target !== TMP && !target.startsWith(TMP + path.sep)) {
    throw new Error(`路径越界（${name} 越出 ${TMP}）`);
  }
  return target;
}

const ZCODE_ORIGINAL =
  JSON.stringify(
    {
      mcp: { servers: { zread: { type: 'remote', url: 'https://api.z.ai/api/mcp/zread/mcp' } } },
      plugins: { enabledPlugins: { docs: true } },
    },
    null,
    2,
  ) + '\n';

const CLAUDE_ORIGINAL =
  JSON.stringify(
    {
      mcpServers: {
        'mcp-filesystem': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/Users/yanyu'] },
      },
      preferences: { x: 1 },
    },
    null,
    2,
  ) + '\n';

function reset() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(ZCODE, ZCODE_ORIGINAL);
  fs.writeFileSync(CLAUDE, CLAUDE_ORIGINAL);
}

/** 进程内测试环境：夹具重定向 + 跳过握手验证（CI 无网络）。 */
function testEnv() {
  return {
    ...process.env,
    YYC3_INSTALL_TEST: '1',
    YYC3_INSTALL_SKIP_VERIFY: '1',
  };
}

const SCRIPT_URL = pathToFileURL(path.join(process.cwd(), 'scripts', 'install-family-mcp.mjs')).href;

const TESTS = [
  {
    name: 'A2-1 预演：--dry-run 不落盘（两宿主配置字节不变）',
    fn: async () => {
      const mod = await import(SCRIPT_URL);
      reset();
      const code = await mod.runCli(['--dry-run'], testEnv());
      assertEq(code, 0, 'dry-run exit 0');
      assertEq(fs.readFileSync(ZCODE, 'utf8'), ZCODE_ORIGINAL, 'ZCode 配置不变');
      assertEq(fs.readFileSync(CLAUDE, 'utf8'), CLAUDE_ORIGINAL, 'Claude 配置不变');
    },
  },
  {
    name: 'A2-2 检查：--check 未接入 exit 2 · 注入后 exit 0',
    fn: async () => {
      const mod = await import(SCRIPT_URL);
      reset();
      const before = await mod.runCli(['--check'], testEnv());
      assertEq(before, 2, '未接入 --check exit 2');
      const install = await mod.runCli([], testEnv());
      assertEq(install, 0, '注入 exit 0');
      const after = await mod.runCli(['--check'], testEnv());
      assertEq(after, 0, '已接入 --check exit 0');
    },
  },
  {
    name: 'A2-3 注入形态：ZCode mcp.servers + environment · Claude mcpServers + env · 三闸块正确 · 既有条目保留',
    fn: async () => {
      const mod = await import(SCRIPT_URL);
      reset();
      await mod.runCli([], testEnv());
      const zcode = JSON.parse(fs.readFileSync(ZCODE, 'utf8'));
      const entry = zcode.mcp.servers['yyc3-family'];
      assert(entry, 'ZCode mcp.servers.yyc3-family 存在');
      assertEq(entry.type, 'stdio', 'ZCode 条目 type');
      assert(entry.environment, 'ZCode environment 键');
      assertEq(entry.environment.LLM_STEP, '1', '三闸一');
      assertEq(entry.environment.LLM_STEP_CONFIRM, '我知晓真实计费', '三闸二');
      assertEq(entry.environment.LLM_STEP_PROVIDER, 'local', '本地网关档');
      assertEq(entry.environment.LLM_STEP_MODEL, 'nemotron-3.5-super-vl', '模型名');
      assertContains(entry.environment.YYC3_USAGE_FILE, 'metrics-usage.json', '计量快照路径');
      const claude = JSON.parse(fs.readFileSync(CLAUDE, 'utf8'));
      const centry = claude.mcpServers['yyc3-family'];
      assert(centry, 'Claude mcpServers.yyc3-family 存在');
      assert(centry.env, 'Claude env 键');
      assertEq(centry.env.LLM_STEP, '1', 'Claude 三闸一');
      assert(zcode.mcp.servers.zread, 'ZCode 既有条目保留');
      assert(claude.mcpServers['mcp-filesystem'], 'Claude 既有条目保留');
    },
  },
  {
    name: 'A2-4 幂等：二次安装不改写（字节级一致）',
    fn: async () => {
      const mod = await import(SCRIPT_URL);
      reset();
      await mod.runCli([], testEnv());
      const z1 = fs.readFileSync(ZCODE, 'utf8');
      const c1 = fs.readFileSync(CLAUDE, 'utf8');
      const r2 = await mod.runCli([], testEnv());
      assertEq(r2, 0, '二次安装 exit 0');
      assertEq(fs.readFileSync(ZCODE, 'utf8'), z1, 'ZCode 字节不变');
      assertEq(fs.readFileSync(CLAUDE, 'utf8'), c1, 'Claude 字节不变');
    },
  },
  {
    name: 'A2-5 备份先行 + 密钥零落盘：备份内容=原文 · 注入仅占位串',
    fn: async () => {
      const mod = await import(SCRIPT_URL);
      reset();
      await mod.runCli([], testEnv());
      const backups = fs.readdirSync(TMP).filter((f) => f.includes('.backup-yyyc3-'));
      assert(backups.length >= 2, '两 host 各一备份');
      const zbackupName = backups.find((f) => f.startsWith('zcode-config'));
      assert(zbackupName, 'ZCode 备份存在');
      const zbackupFile = safeJoinTmp(zbackupName);
      assertEq(fs.readFileSync(zbackupFile, 'utf8'), ZCODE_ORIGINAL, '备份内容=原文');
      const ztext = fs.readFileSync(ZCODE, 'utf8');
      assertContains(ztext, 'local-gateway-keyless', '占位串写入');
      assert(!ztext.includes('Bearer '), '无 Bearer 真值形态');
      assert(!ztext.includes('npm_'), '无 npm_ 真值形态');
      assert(!ztext.includes('sk-'), '无 sk- 真值形态');
    },
  },
  {
    name: 'A2-6 JSONC 宽容解析：注释/尾逗号可解 · 字符串内 // 不误伤',
    fn: async () => {
      const mod = await import(SCRIPT_URL);
      const parsed = mod.parseJsonc(`{
  // 行注释
  "mcp": { "servers": { "a": { "url": "https://x.y/z//keep", "type": "remote" }, } },
  /* 块注释 */
}`);
      assertEq(parsed.mcp.servers.a.url, 'https://x.y/z//keep', '字符串内 // 不误伤');
      assertEq(parsed.mcp.servers.a.type, 'remote', '尾逗号可解');
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
  fs.rmSync(TMP, { recursive: true, force: true }); // 静态隔离目录清理
  console.log(`\n结果：${passed} 通过 / ${failures.length} 失败 / 共 ${TESTS.length} 例`);
  if (failures.length > 0) process.exit(1);
})();
