/**
 * 巡常·技能巡检员 · 自我判断层单测（骨架）。
 * 自动生成自 presets/member-agent；运行方式（需先安装依赖）：`pnpm test`
 * 说明：vitest 风格 describe/it，无运行时依赖，仅示结构与意图。
 *
 * ⚠️ 红线：自我判断必须与 verification-gateway.ground-truth-checker 联合校准。
 */

import { describe, it, expect } from 'vitest';
import { SelfJudge } from '@shared/self-judge-kit';
import { createMemberSelfJudge, extractAssumptions } from '../self-judge/index.js';

describe('巡常·技能巡检员 self-judge（骨架）', () => {
  it('高置信单一意图 → 不升级', () => {
    const judge = createMemberSelfJudge();
    const signal = judge.judge({
      agent: '010301-92',
      taskType: 'general',
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
    const judge = new SelfJudge({ config: { tauLow: 0.6, tauHigh: 0.85 } });
    const signal = judge.judge({
      agent: '010301-92',
      taskType: 'general',
      candidates: [
        { label: 'analysis', score: 0.4 },
        { label: 'prediction', score: 0.38 },
      ],
      assumptions: [],
      uncertaintySources: ['用户输入歧义性', '上下文不足'],
    });
    expect(signal.escalation).not.toBe('none');
  });

  it('指代歧义输入 → 提取高风险假设', () => {
    const assumptions = extractAssumptions('帮我分析一下这个报表');
    expect(assumptions.some((a) => a.riskIfWrong === 'high')).toBe(true);
  });
});
