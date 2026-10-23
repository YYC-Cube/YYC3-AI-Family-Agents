/**
 * 意图分类器（intent-classifier.service）——言启·千行 core。
 * 职责：把用户文本分类为候选意图，并调用 self-judge 产出结构化判断信号。
 * 边界：分类逻辑（规则/LLM）可插拔；判断信号统一由 self-judge 产出。
 *
 * TODO(infra): 分类主力接入 llm-adapter（含 logprob → Candidate.score）；
 *              规则分类来自 procedural/intent-rules.yaml（可版本化）。
 */

import { SelfJudge, type Candidate, type JudgmentSignal } from '@shared/self-judge-kit';
import type { TaskContext } from '@shared/memory-framework';
import { judgeIntent } from '../self-judge/index.js';

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

/**
 * 意图分类器。
 * 依赖注入 SelfJudge（默认使用千行专属配置：intent-classification）。
 */
export class IntentClassifierService {
  constructor(private readonly judge: SelfJudge = new SelfJudge()) {}

  /** 对输入文本做意图分类并产出判断信号。 */
  async classify(input: ClassifyInput): Promise<ClassifyOutput> {
    const candidates = this.proposeCandidates(input.text);
    // TODO(infra): 候选由 LLM logprob + intent-rules.yaml 规则融合产生
    const judgment = judgeIntent(this.judge, {
      agent: '010301-01',
      taskType: 'intent-classification',
      text: input.text,
      candidates,
      traceId: input.ctx.traceId,
    });

    const primary = [...candidates].sort((a, b) => b.score - a.score)[0];
    if (!primary) {
      throw new Error('意图分类未产生任何候选（输入为空或规则失效）');
    }
    return { primary, candidates, judgment };
  }

  /** 生成候选（确定性关键词规则；与 procedural/intent-rules.yaml 对齐）。 */
  private proposeCandidates(text: string): readonly IntentCandidate[] {
    const t = text.toLowerCase();
    const rules: readonly (readonly [string, readonly string[]])[] = [
      ['analysis', ['分析', '统计', '对比', '报告', '查一下', '开销', '数据', 'analyze', 'analysis']],
      ['prediction', ['预测', '趋势', '未来', '预估', 'forecast', 'predict']],
      ['recommendation', ['推荐', '建议', '适合', '哪个好', 'recommend']],
      ['creation', ['创作', '写', '生成', '设计', '草稿', 'create', 'generate']],
      ['orchestration', ['整理', '待办', '清单', '安排', '编排', '调度', '计划', '提醒', 'orchestrate']],
      ['chat', ['你好', '谢谢', 'hello', 'hi']],
    ];
    const raw: IntentCandidate[] = rules.map(([label, kws]) => {
      const hits = kws.filter((k) => t.includes(k)).length;
      // 命中即高置信（0.6 起），多命中递增；避免长关键词表稀释置信度
      return {
        label,
        score: clamp01(0.6 + 0.2 * hits),
        rationale: `命中 ${hits}/${kws.length} 关键词`,
      };
    });
    return raw.filter((c) => c.score > 0);
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
