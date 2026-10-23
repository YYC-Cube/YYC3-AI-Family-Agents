/**
 * 工作流模式（workflow-patterns）——「知/学」支柱 procedural-memory 子模块。
 * 职责：承载可复用的工作流模板（条件 → 策略 → 结果），供学习引擎固化/淘汰。
 *
 * TODO(infra): 与 experience-reflow.pattern-extractor 打通，实现自动提炼与版本管理。
 */

/** 工作流模式条目（"条件X→策略Y→结果Z"三元组的可执行形态）。 */
export interface WorkflowPattern {
  readonly id: string;
  readonly version: string;
  /** 适用条件。 */
  readonly condition: string;
  /** 策略（执行路径）。 */
  readonly strategy: readonly string[];
  /** 预期结果（用于回归校验）。 */
  readonly expectedOutcome?: string;
  /** 历史使用统计。 */
  readonly stats?: { uses: number; successRate: number };
  readonly status: 'active' | 'deprecated' | 'rolled-back';
}

/** 工作流模式库端口。 */
export interface WorkflowPatternStorePort {
  upsert(pattern: WorkflowPattern): WorkflowPattern;
  match(condition: string): readonly WorkflowPattern[];
  list(): readonly WorkflowPattern[];
}

/** 工作流模式库实现（内存桩）。 */
export class WorkflowPatternStore implements WorkflowPatternStorePort {
  private readonly patterns = new Map<string, WorkflowPattern>();

  upsert(pattern: WorkflowPattern): WorkflowPattern {
    this.patterns.set(pattern.id, pattern);
    // TODO(infra): 写入 Git 版本化 YAML（procedural/workflow-patterns.yaml）
    return pattern;
  }

  match(condition: string): readonly WorkflowPattern[] {
    const c = condition.toLowerCase();
    return [...this.patterns.values()].filter(
      (p) => p.status === 'active' && p.condition.toLowerCase().includes(c),
    );
  }

  list(): readonly WorkflowPattern[] {
    return [...this.patterns.values()];
  }
}
