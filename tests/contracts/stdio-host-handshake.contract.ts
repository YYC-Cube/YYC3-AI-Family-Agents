// @ts-nocheck
/**
 * MCP stdio host 握手契约（stdio-host-handshake）—— P0-H5 · 死锁治本回归。
 *
 * 验收：
 *   H5 仓内运行器常驻路径：spawn start-family-server.mjs（真实 host 行为——stdin 保持打开
 *      发 initialize/tools/list/ping 帧）→ 三帧响应 · id 关联 · stdout 仅协议帧；
 *      stdin 关闭 → 排空 → exit 0（优雅停止链）。
 *   背景：修复前 entry 以 readFileSync(0) 读全 stdin 等 EOF、运行器 spawnSync 注入后
 *      stdin 即闭——真实 host 三路径（npm bin / 仓内常驻 / selftest 之外的全部交互路径）
 *      握手死锁或立即退出，本契约为其回归红线。
 *
 * 运行：tsc 编译 + node（零依赖 harness，范式同 mcp-stdio-serve）。
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
      if (!String(actual).includes(exp)) throw new Error(`期望包含 ${JSON.stringify(exp)}，实际 ${String(actual).slice(0, 300)}`);
    },
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`期望长度 ${n}，实际 ${actual.length}`);
    },
  });
}

import { spawn } from 'node:child_process';

const ROOT = process.cwd(); // 门禁以仓库根为 cwd 运行套件

/** 拉起运行器常驻路径（真实 host 行为：stdin 保持打开发帧）。 */
function launch() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/start-family-server.mjs'], {
      cwd: ROOT,
      env: {
        ...process.env,
        YYC3_USAGE_PERSIST: '0', // 契约环境不写计量快照（不污染 git 工作树）
        YYC3_METRICS_PORT: '0', // 随机端口避冲突
        LLM_STEP: '', // 确定性臂即可（本契约不涉 LLM）
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const frames = [];
    let stderr = '';
    child.stdout.on('data', (c) => {
      for (const l of String(c).split('\n')) if (l.trim()) frames.push(l);
    });
    child.stderr.on('data', (c) => {
      stderr += c;
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`握手超时（180s 无三帧响应）。stderr 尾：${stderr.slice(-600)}`));
    }, 180_000);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' })}\n`);
    const poll = () => {
      if (frames.length >= 3) {
        clearTimeout(timer);
        resolve({ child, frames, stderr });
      } else {
        setTimeout(poll, 500);
      }
    };
    poll();
  });
}

describe('MCP stdio host 握手（P0-H5 · 死锁治本）', () => {
  it('H5 真实 host 行为：三帧响应 · id 关联 · stdout 仅协议帧 · 断开优雅退出', async () => {
    const { child, frames } = await launch();
    // stdout 纯净：帧数恰为 3（运行器/装配件日志已归 stderr——H4 协议纯净性）
    expect(frames.length).toBe(3);
    const byId = new Map(frames.map((f) => [JSON.parse(f).id, JSON.parse(f)]));
    expect(byId.get(1).result.serverInfo.name).toBe('yyc3-family');
    expect(byId.get(2).result.tools.length >= 1).toBeTruthy(); // 45 技能目录非空
    expect(JSON.parse(frames[2]).id).toBe(3);
    // stdin 关闭（host 断开）→ 排空 → exit 0（优雅停止链：stop 落盘路径不因持久化关闭而失败）
    const exitCode = await new Promise((resolve) => {
      child.on('exit', (code) => resolve(code));
      child.stdin.end();
      setTimeout(() => {
        child.kill('SIGKILL');
        resolve('timeout');
      }, 30_000);
    });
    expect(exitCode).toBe(0);
  });

  it('H5b 未接入帧前 stdin 即闭（selftest 注入态兼容）：配置整段注入仍正常自检退出', async () => {
    // 运行器 selftest 注入态：stdin 无换行整段配置 → entry 首行读取兼容 EOF
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(process.execPath, ['scripts/start-family-server.mjs', '--selftest'], {
      cwd: ROOT,
      env: {
        ...process.env,
        YYC3_USAGE_PERSIST: '0',
        YYC3_METRICS_PORT: '0',
        LLM_STEP: '',
      },
      encoding: 'utf8',
      timeout: 180_000,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('selftest：装载');
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
