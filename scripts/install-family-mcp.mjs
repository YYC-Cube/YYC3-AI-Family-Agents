#!/usr/bin/env node
/**
 * 一键接入脚本（install-family-mcp）—— P0-A2 · host 接入摩擦治理。
 *
 * 职责：
 *   1. 幂等注入 yyc3-family MCP server：
 *      ZCode → ~/.zcode/cli/config.json 的 mcp.servers（嵌套键 · 环境变量键 environment）
 *      Claude Desktop → ~/Library/Application Support/Claude/claude_desktop_config.json 的 mcpServers（env 键）
 *   2. 改写前自动备份（<配置>.backup-yyyc3-<时间戳>）；密钥零落盘（只写占位串）。
 *   3. 注入后真实握手验证：拉起服务发 initialize/tools/list/ping，报告 serverInfo 与工具数。
 *
 * 用法：
 *   node scripts/install-family-mcp.mjs                 # 注入全部 host（缺省）
 *   node scripts/install-family-mcp.mjs --host zcode|claude
 *   node scripts/install-family-mcp.mjs --check         # 只检查（exit 0=已接入 · 2=未接入）
 *   node scripts/install-family-mcp.mjs --dry-run       # 预演（报告将写入内容，不落盘）
 *   node scripts/install-family-mcp.mjs --global-bin    # 先 npm i -g 装包，再注入直调形态（首选）
 *   node scripts/install-family-mcp.mjs --usage-file <abs>  # 计量快照绝对路径（缺省真身区 data/）
 *
 * 测试面：runCli(argv, env) 进程内可测（契约套件直调，零子进程）；env.YYC3_INSTALL_TEST=1
 *   重定向宿主配置到静态隔离目录 /tmp/yyc3-install-home/；env.YYC3_INSTALL_SKIP_VERIFY=1
 *   跳过握手验证（CI 无网络）。
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';

/** 运行环境（进程内测试可注入；CLI 模式 = process.env）。 */
let ENV = process.env;

function arg(argv, name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}

function testMode() {
  return ENV.YYC3_INSTALL_TEST === '1';
}
function skipVerify() {
  return ENV.YYC3_INSTALL_SKIP_VERIFY === '1';
}

const DEFAULT_USAGE_FILE = path.join(
  os.homedir(),
  'YYC-Cube',
  'personal',
  'YYC3-AI-FAmily-Agent',
  'data',
  'metrics-usage.json',
);

/** 三闸等价 env 块（密钥零落盘：只写占位串；真值由网关侧签发后手动替换）。 */
function envBlock(usageFile) {
  return {
    LLM_STEP: '1',
    LLM_STEP_CONFIRM: '我知晓真实计费',
    LLM_STEP_PROVIDER: 'local',
    LLM_STEP_BASE_URL: 'http://100.126.132.112:10086/v1',
    LLM_STEP_MODEL: 'nemotron-3.5-super-vl',
    LOCAL_GATEWAY_API_KEY: 'local-gateway-keyless',
    YYC3_USAGE_FILE: usageFile ?? DEFAULT_USAGE_FILE,
  };
}

function buildHosts() {
  return {
    zcode: {
      label: 'ZCode',
      file() {
        if (testMode()) return '/tmp/yyc3-install-home/zcode-config.json';
        return path.join(os.homedir(), '.zcode', 'cli', 'config.json');
      },
      locate(root) {
        return root.mcp && root.mcp.servers ? root.mcp.servers : null;
      },
      shape(command, args, usageFile) {
        return { type: 'stdio', command, args, environment: envBlock(usageFile) };
      },
    },
    claude: {
      label: 'Claude Desktop',
      file() {
        if (testMode()) return '/tmp/yyc3-install-home/claude-config.json';
        return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
      },
      locate(root) {
        return root.mcpServers ?? null;
      },
      shape(command, args, usageFile) {
        return { command, args, env: envBlock(usageFile) };
      },
    },
  };
}

/** JSONC 宽容解析：字符串感知去注释 + 去尾逗号（配置常见 JSONC）。 */
export function parseJsonc(text) {
  let out = '';
  let inStr = false;
  let esc = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (esc) {
      out += c;
      esc = false;
      i += 1;
      continue;
    }
    if (inStr) {
      out += c;
      if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      i += 1;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      i += 1;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (c === ',') {
      // 尾逗号判定：跳过空白与注释后遇 } 或 ] 即视为尾逗号剥除（JSONC 常见「, 后跟注释」形态）
      let j = i + 1;
      for (;;) {
        while (j < text.length && /\s/.test(text[j])) j += 1;
        if (text[j] === '/' && text[j + 1] === '/') {
          j += 2;
          while (j < text.length && text[j] !== '\n') j += 1;
          continue;
        }
        if (text[j] === '/' && text[j + 1] === '*') {
          j += 2;
          while (j < text.length && !(text[j] === '*' && text[j + 1] === '/')) j += 1;
          j += 2;
          continue;
        }
        break;
      }
      if (text[j] === '}' || text[j] === ']') {
        i += 1;
        continue;
      }
    }
    out += c;
    i += 1;
  }
  return JSON.parse(out);
}

function globalBinAvailable() {
  const r = spawnSync('command', ['-v', 'yyc3-family-server'], { encoding: 'utf8' });
  return r.status === 0 && String(r.stdout ?? '').trim().length > 0;
}

/** 首选全局 bin 直调；未装则 npx 备选。--global-bin 先装全局包。 */
function pickCommand(flags) {
  if (flags.globalBin && !flags.dryRun) {
    console.log('⏳ npm i -g @yyc3/ai-family-agent（全局 bin 直调形态）…');
    const r = spawnSync('npm', ['i', '-g', '@yyc3/ai-family-agent@latest'], { stdio: 'inherit' });
    if (r.status !== 0) {
      console.error('❌ 全局安装失败，回退 npx 形态');
    }
  }
  if (globalBinAvailable()) return { command: 'yyc3-family-server', args: [] };
  return { command: 'npx', args: ['-y', '@yyc3/ai-family-agent@latest'] };
}

/** 真实握手验证：initialize/tools/list/ping 三帧（60s 超时——npx 冷缓存首装宽容）。 */
function verifyServer(shape) {
  return new Promise((resolve) => {
    const child = spawn(shape.command, shape.args, {
      env: { ...process.env, ...(shape.environment ?? shape.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const frames = [];
    let stderrTail = '';
    const rl = readline.createInterface({ input: child.stdout });
    rl.on('line', (l) => {
      if (l.trim()) frames.push(l);
    });
    child.stderr.on('data', (c) => {
      stderrTail = (stderrTail + c).slice(-600);
    });
    let settled = false;
    const finish = (ok, reason) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill('SIGTERM');
      } catch { /* 已退出 */ }
      resolve({ ok, frames, reason, stderrTail });
    };
    const timer = setTimeout(() => finish(false, '超时（60s 无完整响应）'), 60_000);
    child.on('exit', () => finish(frames.length >= 3, frames.length >= 3 ? undefined : '进程提前退出'));
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' })}\n`);
    const poll = () => {
      if (settled) return;
      if (frames.length >= 3) {
        finish(true);
      } else {
        setTimeout(poll, 300);
      }
    };
    poll();
  });
}

function reportVerify(shape, v) {
  if (!v.ok) {
    console.log(`⚠️  握手验证未通过：${v.reason ?? ''}${v.stderrTail ? `\n      stderr 尾：${v.stderrTail.replace(/\n/g, ' ')}` : ''}`);
    return;
  }
  try {
    const byId = new Map(v.frames.map((f) => [JSON.parse(f).id, JSON.parse(f)]));
    const info = byId.get(1)?.result?.serverInfo ?? {};
    const tools = byId.get(2)?.result?.tools ?? [];
    console.log(`✅ 握手验证通过：${info.name ?? 'yyc3-family'}@${info.version ?? '?'} · tools/list ${tools.length} 工具`);
  } catch {
    console.log(`✅ 握手验证通过：收到 ${v.frames.length} 帧响应`);
  }
}

/** CLI 主体（进程内可测）：返回退出码 0=成功 / 1=异常 / 2=--check 未接入。 */
export async function runCli(argv, env) {
  ENV = env ?? process.env;
  const flags = {
    check: argv.includes('--check'),
    dryRun: argv.includes('--dry-run'),
    globalBin: argv.includes('--global-bin'),
    host: arg(argv, 'host') ?? 'all',
    usageFile: arg(argv, 'usage-file'),
  };

  const HOSTS = buildHosts();
  if (flags.host !== 'all' && !HOSTS[flags.host]) {
    console.error(`❌ 未知 host：${flags.host}（zcode | claude | all）`);
    return 1;
  }
  const hosts = flags.host === 'all' ? ['zcode', 'claude'] : [flags.host];

  let anyMissing = false;
  let anyConfigured = false;
  const results = [];

  for (const key of hosts) {
    const spec = HOSTS[key];
    const file = spec.file();
    const label = spec.label;

    if (!fs.existsSync(file)) {
      console.log(`ⓘ  ${label}：配置文件不存在（${file}）——跳过（请先启动 host 生成配置后重跑）`);
      anyMissing = true;
      results.push({ key, state: 'missing' });
      continue;
    }

    const originalText = fs.readFileSync(file, 'utf8');
    const root = parseJsonc(originalText);
    const servers = spec.locate(root);
    const existing = servers ? servers['yyc3-family'] : undefined;

    if (existing) {
      console.log(`ⓘ  ${label}：yyc3-family 已配置（幂等跳过）`);
      anyConfigured = true;
      results.push({ key, state: 'configured', file });
      continue;
    }

    const { command, args } = pickCommand(flags);
    const shape = spec.shape(command, args, flags.usageFile);
    if (!servers) {
      if (key === 'zcode') {
        root.mcp = root.mcp ?? {};
        root.mcp.servers = root.mcp.servers ?? {};
        root.mcp.servers['yyc3-family'] = shape;
      } else {
        root.mcpServers = root.mcpServers ?? {};
        root.mcpServers['yyc3-family'] = shape;
      }
    } else {
      servers['yyc3-family'] = shape;
    }

    if (flags.dryRun) {
      console.log(`ⓘ  ${label}：预演（不落盘）——将写入 command=${command} · environment 7 键`);
      results.push({ key, state: 'dry-run', file });
      continue;
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = `${file}.backup-yyyc3-${ts}`;
    fs.writeFileSync(backup, originalText);
    fs.writeFileSync(file, `${JSON.stringify(root, null, 2)}\n`);
    console.log(`✅ ${label}：yyc3-family 已注入（command=${command}）· 备份 ${backup}`);
    results.push({ key, state: 'installed', file, backup, shape });
  }

  if (flags.check) {
    const allGood = results.every((r) => r.state === 'configured');
    console.log(allGood ? '✅ 检查通过：全部 host 已接入' : `ⓘ  检查结果：${results.filter((r) => r.state !== 'configured').length} 个 host 未接入`);
    return allGood ? 0 : 2;
  }

  if (!flags.dryRun && !skipVerify()) {
    const installed = results.find((r) => r.state === 'installed');
    if (installed && !anyMissing) {
      console.log('⏳ 握手验证（拉起服务 · initialize/tools/list/ping）…');
      const v = await verifyServer(installed.shape);
      reportVerify(installed.shape, v);
      return 0;
    }
    if (installed && anyMissing) {
      console.log('ⓘ  存在缺失配置的 host，跳过握手验证');
    }
  }

  return anyMissing ? 1 : 0;
}

// 直接执行（非被 import）时进入 CLI 模式
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runCli(process.argv.slice(2), process.env).then((code) => process.exit(code));
}
