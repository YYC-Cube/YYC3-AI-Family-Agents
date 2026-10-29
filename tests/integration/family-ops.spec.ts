// @ts-nocheck
/**
 * 家族编排套件测试（family-ops）—— P8-a（M26）· C 类第二批四件转实。
 *
 * 验收：
 *   O1 编排分发：逐步真实分发成功/失败记账不中断；traceId 贯穿端口
 *   O2 低置信仲裁：verifier 拦截 → 整体拒绝；缺省无端口保持兼容语义
 *   O3 态势推导：down > degraded > ok；资源压力阈值降级；零上报 ok
 *   O4 电话系统：call/endCall 时长与结果回填；热线反查；私信投递端口与信箱
 *   O5 基础设施自愈：actuator 成功 healed + RTO 实测判契约；失败如实 failed；无通道 failed
 *
 * 运行：tsc 编译 + node（零依赖 harness，范式同 family-server-assembly）。
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
  });
}

import { CloudPivotOrchestrator } from '../../architecture-kernel/02-云枢核心引擎/cloud-pivot-orchestrator/orchestrator.js';
import { StatusCenter } from '../../architecture-kernel/02-云枢核心引擎/global-status-center/status-center.js';
import { PhoneSystem } from '../../architecture-kernel/02-云枢核心引擎/family-phone-system/phone-system.js';
import { DashuSelfHealingController } from '../../architecture-kernel/02-云枢核心引擎/dashu-self-healing/self-healing-controller.js';
import { TaskDecomposer } from '../../architecture-kernel/02-云枢核心引擎/cloud-pivot-orchestrator/task-decomposer.js';

describe('家族编排套件（P8-a · M26 · C 类第二批）', () => {
  it('O1 编排分发：逐步真实分发，失败记账不中断，traceId 贯穿', async () => {
    const seen = [];
    const orchestrator = new CloudPivotOrchestrator({
      dispatcher: {
        dispatch: async (step, plan) => {
          if (step.id === 's2') throw new Error('承接家人不可达');
          seen.push({ owner: step.owner, traceId: plan.traceId });
        },
      },
    });
    const plan = {
      traceId: 't-dispatch',
      intentId: 'i1',
      steps: [
        { id: 's1', stage: 'execute', owner: 'thinker', goal: '分析' },
        { id: 's2', stage: 'execute', owner: 'prophet', goal: '预测' },
        { id: 's3', stage: 'review', owner: 'grandmaster', goal: '复盘' },
      ],
    };
    const res = await orchestrator.dispatch(plan);
    expect(res.dispatched.join(',')).toBe('thinker,grandmaster');
    expect(res.failed.join(',')).toBe('prophet');
    expect(seen.every((s) => s.traceId === 't-dispatch')).toBeTruthy();
  });

  it('O2 低置信仲裁：拦截整体拒绝；无端口缺省兼容；plan() 分解不变', async () => {
    const orchestrator = new CloudPivotOrchestrator({
      verifier: { allow: (_plan, confidence) => confidence >= 0.6 },
    });
    const plan = { traceId: 't-v', intentId: 'i', steps: [{ id: 's1', stage: 'clarify', owner: 'qianhang', goal: '澄清' }] };
    const blocked = await orchestrator.dispatch(plan, 0.3);
    expect(blocked.dispatched).toHaveLength(0);
    expect(blocked.failed.join(',')).toBe('qianhang');
    const allowed = await orchestrator.dispatch(plan, 0.9);
    expect(allowed.dispatched.join(',')).toBe('qianhang');
    // 无端口缺省：仅产出承接清单（既有语义）
    const legacy = new CloudPivotOrchestrator();
    const legacyRes = await legacy.dispatch(plan);
    expect(legacyRes.dispatched).toHaveLength(1);
    // plan() 仍走 decomposer
    const intent = { id: 'i9', traceId: 't9', utterance: '分析上月销量', confidence: 0.95 };
    const decomposed = legacy.plan(intent);
    expect(decomposed.traceId).toBe('t9');
    expect(Array.isArray(decomposed.steps)).toBeTruthy();
  });

  it('O3 态势推导：down > degraded > ok；资源压力降级；零上报 ok；去重覆盖', () => {
    const center = new StatusCenter(0.9);
    expect(center.snapshot(1).overall).toBe('ok'); // 零上报
    center.reportFamily({ agent: 'thinker', status: 'degraded', activeTasks: 2, at: 1 });
    expect(center.snapshot(2).overall).toBe('degraded');
    center.reportService({ name: 'metrics', status: 'down' });
    expect(center.snapshot(3).overall).toBe('down');
    // 修复后回到 degraded（去重覆盖语义）
    center.reportService({ name: 'metrics', status: 'ok' });
    expect(center.snapshot(4).overall).toBe('degraded');
    // 资源压力阈值单独触发 degraded
    const fresh = new StatusCenter(0.9);
    fresh.reportResource({ resource: 'cpu', usedRatio: 0.95 });
    expect(fresh.snapshot(5).overall).toBe('degraded');
    fresh.reportResource({ resource: 'cpu', usedRatio: 0.5 });
    expect(fresh.snapshot(6).overall).toBe('ok');
  });

  it('O4 电话系统：通话生命周期/热线反查/私信投递与信箱', async () => {
    let clock = 1_000;
    const delivered = [];
    const phone = new PhoneSystem(() => clock, { deliver: async (m) => delivered.push(m) });
    phone.register({ id: 'c1', name: '元启', agent: 'tianshu', hotline: '9001' });
    phone.register({ id: 'c2', name: '言启', agent: 'qianhang' });
    expect(phone.directory()).toHaveLength(2);
    expect(phone.contactByHotline('9001').agent).toBe('tianshu');
    expect(phone.contactByHotline('0000')).toBe(undefined);

    const call = await phone.call('qianhang', 'tianshu');
    clock = 1_650;
    const ended = phone.endCall(call.id, 'answered');
    expect(ended.durationMs).toBe(650);
    expect(ended.outcome).toBe('answered');
    expect(phone.callLog()).toHaveLength(1);

    await phone.sendDirect({ id: 'm1', from: 'qianhang', to: 'tianshu', content: '任务已派发', at: 2_000 });
    expect(delivered).toHaveLength(1); // 端口投递成功
    expect(phone.inboxOf('tianshu')).toHaveLength(1);
    expect(phone.outboxOf('qianhang')).toHaveLength(1);
    expect(phone.inboxOf('qianhang')).toHaveLength(0);

    // 投递失败：不落信箱、如实上抛
    const failing = new PhoneSystem(() => 1, { deliver: async () => { throw new Error('总线不可达'); } });
    let threw = '';
    try {
      await failing.sendDirect({ id: 'm2', from: 'a', to: 'b', content: 'x', at: 1 });
    } catch (e) {
      threw = e.message;
    }
    expect(threw).toContain('总线不可达');
    expect(failing.inboxOf('b')).toHaveLength(0);
  });

  it('O5 基础设施自愈：成功 healed + RTO 契约；失败如实 failed；无通道 failed', async () => {
    const action = { id: 'a1', faultId: 'f1', layer: 'infrastructure', kind: 'scale', target: 'pod/family-api' };
    // 成功 + 契约判定（RTO 5s）
    const controller = new DashuSelfHealingController(
      { apply: async () => ({ detail: '扩容至 3 副本', rpoSeconds: 0 }) },
      { rtoSeconds: 5, rpoSeconds: 10 },
    );
    const healed = await controller.apply(action);
    expect(healed.status).toBe('healed');
    expect(healed.contractMet).toBeTruthy();
    expect(healed.rtoSeconds >= 0).toBeTruthy();
    expect(healed.detail).toContain('扩容');
    // 失败：如实 failed（detail 带原因，不抛出）
    const failing = new DashuSelfHealingController({
      apply: async () => { throw new Error('K8s API 超时'); },
    });
    const failed = await failing.apply(action);
    expect(failed.status).toBe('failed');
    expect(failed.contractMet).toBeFalsy();
    expect(failed.detail).toContain('K8s API 超时');
    // 无通道：如实 failed（不再假 healed）
    const none = new DashuSelfHealingController();
    const noChannel = await none.apply(action);
    expect(noChannel.status).toBe('failed');
    expect(noChannel.detail).toContain('未注入 InfraActuator');
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
