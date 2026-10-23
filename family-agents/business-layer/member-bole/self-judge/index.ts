/**
 * 千里·伯乐 · 自我判断层（self-judge）——「自」支柱实例化。
 * 自动生成自 presets/member-agent。
 *
 * ⚠️ 红线：自我判断不得脱离外部世界状态，必须与
 *    verification-gateway.ground-truth-checker 联合校准（防「进展海市蜃楼」）。
 *
 * TODO(infra): 接入 verification-gateway 做外部真值复验。
 */

import { SelfJudge, type Assumption } from '@shared/self-judge-kit';

/** 千里·伯乐 专属判断配置（tauLow 可按家人职责调整）。 */
export const MEMBER_JUDGMENT_CONFIG = {
  tauLow: 0.6,
  tauHigh: 0.85,
} as const;

/** 创建该家人的 SelfJudge 实例。 */
export function createMemberSelfJudge(): SelfJudge {
  return new SelfJudge({ config: { ...MEMBER_JUDGMENT_CONFIG } });
}

/** 从文本启发式提取隐式假设（桩，请按职责定制）。 */
export function extractAssumptions(text: string): Assumption[] {
  const out: Assumption[] = [];
  if (/这个|那个|它|他|她/.test(text)) {
    out.push({
      statement: '用户指代对象可由上文唯一确定',
      basis: '对话上下文存在先行词',
      riskIfWrong: 'high',
    });
  }
  return out;
}
