/**
 * 言启·千行 · 自我判断层单测（骨架）。
 * 运行方式（需先安装依赖，本骨架不执行安装）：`pnpm test`
 * 说明：vitest 风格 describe/it，无运行时依赖，仅示结构与意图。
 *
 * ⚠️ 红线：自我判断必须与 verification-gateway.ground-truth-checker 联合校准。
 */

import { describe, it, expect } from 'vitest';
import { SelfJudge } from '@shared/self-judge-kit';
import { createQianhangSelfJudge, extractAssumptions, judgeIntent } from '../self-judge/index.js';

describe('千行 self-judge（意图分类）', () => {
  it('高置信单一意图 → 不升级', () => {
    const judge = createQianhangSelfJudge();
    const signal = judge.judge({
      agent: '010301-01',
      taskType: 'intent-classification',
      candidates: [
        { label: 'analysis', score: 0.95 },
        { label: 'chat', score: 0.1 },
      ],
      assumptions: [],
      uncertaintySources: [],
    });
    // TODO: 校准后断言具体数值
    expect(signal.confidence).toBeGreaterThan(0.6);
    expect(signal.escalation).toBe('none');
  });

  it('低置信 → 强制升级（禁止直接产出）', () => {
    const judge = new SelfJudge({ config: { tauLow: 0.65, tauHigh: 0.9 } });
    const signal = judge.judge({
      agent: '010301-01',
      taskType: 'intent-classification',
      candidates: [
        { label: 'analysis', score: 0.4 },
        { label: 'prediction', score: 0.38 },
      ],
      assumptions: [],
      uncertaintySources: ['用户输入歧义性', '上下文不足'],
    });
    expect(signal.escalation).not.toBe('none');
  });

  it('高严重度偏离 → 人工确认', () => {
    const judge = createQianhangSelfJudge();
    const signal = judge.judge({
      agent: '010301-01',
      taskType: 'intent-classification',
      candidates: [{ label: 'analysis', score: 0.9 }],
      assumptions: [],
      uncertaintySources: [],
      actualBehavior: { steps: ['跳过澄清', '直接路由'] },
      expectedPattern: { id: 'qianhang.std', version: '1.0.0', steps: ['澄清歧义', '分类', '路由'] },
    });
    expect(signal.deviation?.severity).toBe('high');
    expect(signal.escalation).toBe('human-confirm');
  });

  it('指代歧义输入 → 提取高风险假设', () => {
    const assumptions = extractAssumptions('帮我分析一下这个报表');
    expect(assumptions.some((a) => a.riskIfWrong === 'high')).toBe(true);
  });

  it('judgeIntent 产出完整 JudgmentSignal 结构', () => {
    const judge = createQianhangSelfJudge();
    const signal = judgeIntent(judge, {
      agent: '010301-01',
      taskType: 'intent-classification',
      text: '预测下季度趋势',
      candidates: [
        { label: 'prediction', score: 0.8 },
        { label: 'analysis', score: 0.3 },
      ],
      traceId: 'trace-test-001',
    });
    expect(signal).toHaveProperty('confidence');
    expect(signal).toHaveProperty('uncertaintySources');
    expect(signal).toHaveProperty('assumptions');
    expect(signal).toHaveProperty('escalation');
  });
});
