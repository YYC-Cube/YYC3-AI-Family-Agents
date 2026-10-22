/**
 * 程序记忆（procedural-memory）——「知」支柱第 5 层。
 * 生命周期：版本化永久｜存储介质：Git 版本化 YAML｜写入触发：学习引擎固化 / 人工审核。
 *
 * 独立化（G1 处置）：把 prompt/system-prompt 中的工具使用模式、工作流约束、行为规则，
 * 提取为可版本化条目，可审计、可 A/B、可回滚。
 */

import { GuardrailRegistry } from './guardrail-registry.js';
import { SkillRegistry } from './skill-registry.js';
import { WorkflowPatternStore } from './workflow-patterns.js';
import type { MemoryHit, MemoryQuery } from '../types.js';

export { SkillRegistry, compareSemver } from './skill-registry.js';
export { WorkflowPatternStore } from './workflow-patterns.js';
export { GuardrailRegistry } from './guardrail-registry.js';
export type { SkillDefinition, SkillStep } from './skill-registry.js';
export type { WorkflowPattern } from './workflow-patterns.js';
export type { GuardrailRule } from './guardrail-registry.js';

/** 程序记忆端口。 */
export interface ProceduralStorePort {
  skills: SkillRegistry;
  workflows: WorkflowPatternStore;
  guardrails: GuardrailRegistry;
  retrieve(query: MemoryQuery): readonly MemoryHit[];
}

/** 程序记忆实现（内存桩）。 */
export class ProceduralStore implements ProceduralStorePort {
  readonly skills = new SkillRegistry();
  readonly workflows = new WorkflowPatternStore();
  readonly guardrails = new GuardrailRegistry();

  retrieve(query: MemoryQuery): readonly MemoryHit[] {
    const text = (query.text ?? '').toLowerCase();
    const hits: MemoryHit[] = [];
    if (text) {
      for (const s of this.skills.list()) {
        if (s.name.toLowerCase().includes(text) || s.when.some((w) => w.toLowerCase().includes(text))) {
          hits.push({ layer: 'procedural', id: `skill:${s.id}@${s.version}`, content: s, score: 0.9, salience: 0.8 });
        }
      }
      for (const w of this.workflows.match(text)) {
        hits.push({ layer: 'procedural', id: `wf:${w.id}@${w.version}`, content: w, score: 0.85, salience: 0.75 });
      }
    }
    return hits.slice(0, query.limit ?? 50);
  }
}
