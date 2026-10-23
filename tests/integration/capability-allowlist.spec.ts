// @ts-nocheck
/**
 * 准入治理测试（capability-allowlist）—— P4-T3 observe / enforce + ComplianceAudit 留痕。
 * 门禁映射：默认 observe（只记审计）；enforce 需显式开关；未准入调用写审计链；
 *   enforce 下拒绝并计数；审计链防篡改（断链即 false）。
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ComplianceAudit } from '../../architecture-kernel/06-治理中心/compliance-audit/compliance-audit.js';
import {
  ADMISSION_MODES,
  ADMISSION_POLICY_ID,
  CapabilityAllowlist,
  DEFAULT_ADMISSION_ACTION,
  DEFAULT_ADMISSION_MODE,
} from '../../architecture-kernel/10-能力注册中心/index.js';

const ROOT = process.cwd();

/** 金包 id（与 plugin.yaml 资产同源）。 */
function goldenId() {
  const yaml = readFileSync(path.join(ROOT, 'plugins/family-core/plugin.yaml'), 'utf8');
  return /^id: (.+)$/m.exec(yaml)?.[1];
}

const call = (pluginId, traceId = 'trace-1', actor = 'qianxing') => ({ pluginId, traceId, actor });

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
    toThrow: (fragment) => {
      let threw = null;
      try {
        actual();
      } catch (e) {
        threw = e;
      }
      if (!threw) throw new Error('期望抛错，但未抛');
      if (fragment && !String(threw.message).includes(fragment)) {
        throw new Error(`错误消息缺「${fragment}」：${threw.message}`);
      }
    },
  });
}

describe('准入治理（P4-T3）', () => {
  it('默认 observe：未准入调用放行但留痕，不计数拒绝；enforce 需显式开关且非法模式即抛', () => {
    const gate = new CapabilityAllowlist({ allowed: [goldenId()] });
    expect(DEFAULT_ADMISSION_MODE).toBe('observe');
    expect(gate.admissionMode).toBe('observe');
    expect(ADMISSION_MODES.join(',')).toBe('observe,enforce');

    const d = gate.admit(call('rogue-pack'));
    expect(d.admitted).toBe(true);
    expect(d.audited).toBe(true);
    expect(d.reason.includes('observe')).toBe(true);
    expect(gate.rejectedCount).toBe(0);
    expect(gate.observedCount).toBe(1);

    expect(() => new CapabilityAllowlist({ allowed: [], mode: 'block' })).toThrow('准入模式非法');
  });

  it('准入清单内调用：直接放行且不写审计（零噪声）', () => {
    const gate = new CapabilityAllowlist({ allowed: [goldenId()] });
    const d = gate.admit(call(goldenId(), 'trace-allow'));
    expect(d.admitted).toBe(true);
    expect(d.audited).toBe(false);
    expect(d.reason).toBe('已在准入清单');
    expect(gate.auditRecords.length).toBe(0);
    expect(gate.observedCount).toBe(0);
    expect(gate.verifyAudit()).toBe(true);
  });

  it('审计留痕：未准入调用写入 ComplianceAudit（字段完整 + 链完整性）', () => {
    const gate = new CapabilityAllowlist({ allowed: [] });
    gate.admit(call('rogue-pack', 'trace-audit', 'tianshu'));

    const records = gate.auditRecords;
    expect(records.length).toBe(1);
    const r = records[0];
    expect(r.traceId).toBe('trace-audit');
    expect(r.actor).toBe('tianshu');
    expect(r.action).toBe(DEFAULT_ADMISSION_ACTION);
    expect(r.resource).toBe('rogue-pack');
    expect(r.decision.decision).toBe('allow-with-audit');
    expect(r.decision.policyId).toBe(ADMISSION_POLICY_ID);
    expect(r.decision.obligations.join(',')).toBe('记录审计');
    expect(gate.verifyAudit()).toBe(true);
  });

  it('enforce 显式开关：未准入拒绝并计数，准入包照常放行', () => {
    const gate = new CapabilityAllowlist({ allowed: [goldenId()], mode: 'enforce' });
    for (let i = 1; i <= 3; i += 1) {
      const d = gate.admit(call('rogue-pack', `trace-deny-${i}`));
      expect(d.admitted).toBe(false);
      expect(d.audited).toBe(true);
      expect(d.reason.includes('enforce 拒绝')).toBeTruthy();
    }
    expect(gate.rejectedCount).toBe(3);
    expect(gate.observedCount).toBe(0);
    expect(gate.auditRecords.length).toBe(3);
    expect(gate.auditRecords[2].decision.decision).toBe('deny');
    expect(gate.verifyAudit()).toBe(true);

    expect(gate.admit(call(goldenId(), 'trace-deny-ok')).admitted).toBe(true);
    expect(gate.rejectedCount).toBe(3);
    expect(gate.auditRecords.length).toBe(3);
  });

  it('审计链可注入共享：准入留痕与策略总线共用同一条不可篡改链', () => {
    const shared = new ComplianceAudit();
    const gate = new CapabilityAllowlist({ allowed: [goldenId()], audit: shared });

    gate.admit(call(goldenId(), 'trace-shared-ok'));
    expect(shared.list().length).toBe(0);

    gate.admit(call('rogue-pack', 'trace-shared'));
    expect(shared.list().length).toBe(1);
    expect(gate.auditRecords.length).toBe(1);
    expect(gate.verifyAudit()).toBe(true);
  });

  it('决策确定性：同一输入重复判定结果恒定，留痕逐条追加', () => {
    const gate = new CapabilityAllowlist({ allowed: [goldenId(), goldenId()] });
    const first = gate.admit(call('rogue-pack', 'trace-det'));
    const second = gate.admit(call('rogue-pack', 'trace-det'));
    expect(first.admitted).toBe(second.admitted);
    expect(first.reason).toBe(second.reason);
    expect(first.audited).toBe(second.audited);
    expect(gate.observedCount).toBe(2);
    expect(gate.auditRecords.length).toBe(2);
    expect(gate.isAllowed(goldenId())).toBe(true);
    expect(gate.isAllowed('rogue-pack')).toBe(false);
  });

  it('可见性过滤：金包 id 与 plugin.yaml 资产同源，未准入包不可见', () => {
    const gate = new CapabilityAllowlist({ allowed: [goldenId()] });
    expect(goldenId()).toBe('family-core');
    const manifests = [
      { id: goldenId(), version: '1.0.0', scope: 'builtin' },
      { id: 'rogue-pack', version: '1.0.0', scope: 'local' },
    ];
    const visible = gate.filterAllowed(manifests).map((m) => m.id);
    expect(visible.join(',')).toBe('family-core');
    expect(visible.length).toBe(manifests.length - 1);
  });

  it('审计链防篡改：准入留痕被改写 → verifyAudit 断链', () => {
    const gate = new CapabilityAllowlist({ allowed: [] });
    gate.admit(call('rogue-pack', 'trace-tamper'));
    expect(gate.verifyAudit()).toBe(true);
    // 运行时篡改审计内容（readonly 仅类型层约束）
    gate.auditRecords[0].decision.reason = '已准入（伪造）';
    expect(gate.verifyAudit()).toBe(false);
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
