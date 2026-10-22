/**
 * 意图分类器（intent-classifier.service）——格物·宗师 core。
 * 自动生成自 presets/member-agent；请补齐 TODO(infra) 与业务逻辑。
 * 职责：把用户文本分类为候选意图，并调用 self-judge 产出结构化判断信号。
 * 边界：分类逻辑（规则/LLM）可插拔；判断信号统一由 self-judge 产出。
 *
 * TODO(infra): 分类主力接入 llm-adapter（含 logprob → Candidate.score）；
 *              规则分类来自 procedural/intent-rules.yaml（可版本化）。
 */

import { type Candidate, type JudgmentSignal } from '@shared/self-judge-kit';
import type { TaskContext } from '@shared/memory-framework';
import { createMemberSelfJudge, extractAssumptions } from '../self-judge/index.js';

/** 分类输入。 */
export interface ClassifyInput {
  readonly text: string;
  readonly ctx: TaskContext;
}

/** 单个候选意图。 */
export interface IntentCandidate extends Candidate {
  readonly rationale?: string;
}

/** 分类输出。 */
export interface ClassifyOutput {
  readonly primary: IntentCandidate;
  readonly candidates: readonly IntentCandidate[];
  /** 【自】结构化判断信号（置信度/假设/偏离/升级）。 */
  readonly judgment: JudgmentSignal;
}

/** 意图分类器（member-grandmaster）。 */
export class IntentClassifierService {
  /** 生成候选（桩实现：待接入规则/LLM）。 */
  private proposeCandidates(_text: string): readonly IntentCandidate[] {
    // TODO(infra): LLM logprob + procedural/intent-rules.yaml 规则融合产生候选
    return [];
  }

  /** 对输入文本做意图分类并产出判断信号。 */
  async classify(input: ClassifyInput): Promise<ClassifyOutput> {
    const candidates = this.proposeCandidates(input.text);
    const judgment = createMemberSelfJudge().judge({
      agent: '010301-07',
      taskType: 'general',
      candidates: [...candidates],
      assumptions: extractAssumptions(input.text),
      uncertaintySources: [],
    });

    const primary = candidates[0];
    if (!primary) {
      throw new Error('意图分类未产生任何候选（骨架：规则/LLM 尚未接入）');
    }
    return { primary, candidates, judgment };
  }
}
