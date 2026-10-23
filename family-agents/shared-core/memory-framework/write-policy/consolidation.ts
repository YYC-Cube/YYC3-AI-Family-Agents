/**
 * 记忆巩固（consolidation）——「知」支柱 write-policy 子模块。
 * 职责：短期（sensory/working）→ 长期（episodic/semantic）的巩固决策。
 * 触发点：任务链路结束（task.completed）。
 *
 * TODO(infra): 引入批量巩固调度（learning-scheduler.budget-allocator）。
 */

import type { MemoryLayer, WritableMemoryLayer } from '../types.js';

/** 待巩固条目。 */
export interface CandidateItem {
  readonly id: string;
  readonly fromLayer: MemoryLayer;
  readonly content: unknown;
  readonly salience: number;
  readonly eventTime: number;
}

/** 巩固计划：将短期条目映射到长期层。 */
export interface ConsolidationPlan {
  readonly items: readonly { id: string; targetLayer: WritableMemoryLayer; content: unknown; salience: number }[];
  readonly skipped: readonly string[];
}

/**
 * 记忆巩固器。
 * 规则：显著度 ≥ 阈值的高价值短期条目进入长期；工作记忆中的稳定事实进入语义层。
 */
export class Consolidation {
  constructor(private readonly threshold = 0.6) {}

  plan(items: readonly CandidateItem[]): ConsolidationPlan {
    const planned: Array<ConsolidationPlan['items'][number]> = [];
    const skipped: string[] = [];
    for (const it of items) {
      if (it.salience < this.threshold) {
        skipped.push(it.id);
        continue;
      }
      planned.push({
        id: it.id,
        targetLayer: this.targetOf(it),
        content: it.content,
        salience: it.salience,
      });
    }
    // TODO(infra): 写入长期层前做去重/合并（与既有记忆比对）
    return { items: planned, skipped };
  }

  /** 源层 → 目标层映射。 */
  private targetOf(it: CandidateItem): WritableMemoryLayer {
    switch (it.fromLayer) {
      case 'working':
        return 'semantic';
      case 'sensory':
      case 'episodic':
        return 'episodic';
      case 'semantic':
      case 'procedural':
        return 'semantic';
      default:
        return 'episodic';
    }
  }
}
