// @ts-nocheck
/**
 * 安全策略映射集成测试（security-policy-bind.spec）—— P2-T4。
 * 门禁映射：蓝图 1209 三策略（零信任/内容过滤/注入检测）注册进 PolicyRegistry；
 *   默认 observe（命中 allow-with-audit + 审计链留痕）；enforce 显式开关（命中 deny + 计数）；
 *   无命中 allow；版本化 latest。YAML 事实源经 check-security-policies 真实解析消费。
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ComplianceAudit, PolicyRegistry, registerSecurityPolicies, SecurityPolicyBinder } from '../../architecture-kernel/06-治理中心/index.js';

const ROOT = process.cwd();
const SCRIPT = 'scripts/check-security-policies.mjs';

const res = spawnSync(process.execPath, [SCRIPT, '--json'], { cwd: ROOT, encoding: 'utf8' });
const jsonStart = res.stdout.indexOf('{');
const report = JSON.parse(res.stdout.slice(jsonStart, res.stdout.lastIndexOf('}') + 1));
const OBSERVE_DEFS = report.policies;

/** enforce 变体（仅 zero-trust 开关；验证「显式开关」语义）。 */
const ENFORCE_DEFS = OBSERVE_DEFS.map((p) => (p.id === 'security.zero-trust' ? { ...p, mode: 'enforce' } : p));

function reqOf(action, resource) {
  return { traceId: `trace-${action}-${resource ?? '-'}`, actor: 'tianshu', action, resource: resource ?? 'model.input' };
}

function buildBinder(defs, deps = {}) {
  const registry = new PolicyRegistry();
  const modes = registerSecurityPolicies(registry, defs);
  return new SecurityPolicyBinder({ registry, ...deps }, modes);
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
    toBeFalsy: () => {
      if (actual) throw new Error(`期望假值，实际 ${JSON.stringify(actual)}`);
    },
  });
}

describe('安全策略映射（P2-T4 · observe 默认 / enforce 显式）', () => {
  it('YAML 事实源：蓝图 1209 三策略（零信任/内容过滤/注入检测）解析合法', () => {
    globalThis.expect(res.status).toBe(0);
    globalThis.expect(report.ok).toBeTruthy();
    globalThis.expect(OBSERVE_DEFS.length).toBe(3);
    const ids = OBSERVE_DEFS.map((p) => p.id).sort().join(',');
    globalThis.expect(ids).toBe('security.content-filter,security.injection-detect,security.zero-trust');
    globalThis.expect(OBSERVE_DEFS.every((p) => p.mode === 'observe')).toBeTruthy();
    globalThis.expect(OBSERVE_DEFS.every((p) => p.source === 'blueprint-1209')).toBeTruthy();
  });

  it('observe 默认：命中 allow-with-audit + 审计链留痕（verify 防篡改）', () => {
    const audit = new ComplianceAudit();
    const binder = buildBinder(OBSERVE_DEFS, { audit });
    const d = binder.evaluate(reqOf('tool.invoke', 'qianhang.nlq-to-api'));
    globalThis.expect(d.decision).toBe('allow-with-audit');
    // match 取首个 scope 命中（注册序 = YAML 序：zero-trust 先于 injection-detect）
    globalThis.expect(d.policyId).toBe('security.zero-trust');
    globalThis.expect(binder.deniedTotal).toBe(0);
    globalThis.expect(audit.list().length).toBe(1);
    globalThis.expect(audit.verify()).toBeTruthy();
  });

  it('enforce 显式开关：zero-trust 命中即 deny + 计数；其余策略仍 observe', () => {
    const audit = new ComplianceAudit();
    let deniedId = '';
    const binder = buildBinder(ENFORCE_DEFS, { audit, onDeny: (id) => { deniedId = id; } });
    const denied = binder.evaluate(reqOf('model.call', 'self'));
    globalThis.expect(denied.decision).toBe('deny');
    globalThis.expect(denied.policyId).toBe('security.zero-trust');
    globalThis.expect(binder.deniedTotal).toBe(1);
    globalThis.expect(deniedId).toBe('security.zero-trust');
    // tool.invoke 亦命中 zero-trust（wildcard）→ deny 计数递增
    const denied2 = binder.evaluate(reqOf('tool.invoke', 'x'));
    globalThis.expect(denied2.decision).toBe('deny');
    globalThis.expect(binder.deniedTotal).toBe(2);
    // 审计链含 deny + observe 双类记录且校验通过
    globalThis.expect(audit.list().length).toBe(2);
    globalThis.expect(audit.verify()).toBeTruthy();
  });

  it('无命中 allow（default-allow）；scope 维度外不误拦', () => {
    const binder = buildBinder(OBSERVE_DEFS, {});
    const allow = binder.evaluate({ traceId: 't0', actor: 'grace', action: 'memory.write', resource: 'episodic' });
    globalThis.expect(allow.decision).toBe('allow');
    globalThis.expect(allow.policyId).toBe('default-allow');
    // content-filter 只看 resources=model.input；tool.invoke/resource=tool.x 不触发它
    const d = binder.evaluate(reqOf('tool.invoke', 'tool.x'));
    globalThis.expect(['allow', 'allow-with-audit'].includes(d.decision)).toBeTruthy();
    globalThis.expect(binder.deniedTotal).toBe(0);
  });

  it('版本化：同 id 注册 v1.0.0/v1.1.0，match 取最新 active 版本', () => {
    const binder = buildBinder(OBSERVE_DEFS, {});
    const registry = new PolicyRegistry();
    registerSecurityPolicies(registry, [
      { ...OBSERVE_DEFS[0], version: '1.0.0' },
      { ...OBSERVE_DEFS[0], version: '1.1.0' },
    ]);
    const latest = registry.match(reqOf('model.call', 'self'))[0];
    globalThis.expect(latest.version).toBe('1.1.0');
    void binder;
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
