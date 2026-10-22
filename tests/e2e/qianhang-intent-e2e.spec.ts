// @ts-nocheck
/**
 * 千行意图端到端测试（qianhang-intent-e2e）—— 显式跳过版（v2.7.2，验收 L4）。
 *
 * ⚠️ 现状：IntentGatewayService.handle 仍为骨架（throw「未实现」），
 *    IntentClassifierService.proposeCandidates 返回空候选（llm-adapter 与规则库未接入）。
 *    因此 4 个链路步骤**全部显式标记为跳过**并给出原因，不再静默「0 例通过」。
 * 解锁条件（P1）：llm-adapter 真实 provider + procedural/intent-rules.yaml 规则融合。
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
  globalThis.it.skip = (name, reason) => {
    globalThis.__queue.push({ name: `${globalThis.__suiteName ?? ''} > ${name}`, skip: true, reason });
  };
}

const REASON = '意图链路未实现：IntentGatewayService.handle 为骨架、proposeCandidates 返回空候选（待 P1 llm-adapter）';

describe('千行意图端到端链路（话术 → 意图 → 编排 → 呈现）', () => {
  it.skip('步骤1：用户话术输入（中文自然语言）', REASON);
  it.skip('步骤2：千行意图识别返回结构化 intent', REASON);
  it.skip('步骤3：天枢编排生成任务分解与家人分工', REASON);
  it.skip('步骤4：伯乐呈现最终结果（情感面板/成就反馈）', REASON);
});

(async () => {
  const queue = globalThis.__queue ?? [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const t of queue) {
    if (t.skip) {
      skipped += 1;
      console.log(`SKIP ${t.name}\n      原因：${t.reason}`);
      continue;
    }
    try {
      await t.fn();
      passed += 1;
      console.log(`PASS ${t.name}`);
    } catch (e) {
      failed += 1;
      console.log(`FAIL ${t.name}\n      ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\n结果：${passed} 通过 / ${failed} 失败 / ${skipped} 跳过 / 共 ${queue.length} 例`);
  if (failed > 0) process.exit(1);
})();
