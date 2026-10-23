/**
 * 实体解析器（entity-resolver）——「知」支柱 semantic-graph 子模块。
 * 职责：把用户输入中的实体指称解析为图谱中的规范化实体（消歧 + 归一）。
 * 边界：只做实体对齐，不做关系推理。
 *
 * TODO(infra): 接入实体链接模型（EL）+ 别名库 + 上下文消歧。
 */

import type { Entity, KnowledgeGraphPort } from './knowledge-graph.js';

/** 实体映射（别名/画像 → 规范化实体）。 */
export interface EntityMention {
  readonly surface: string;
  /** 候选实体 id 及置信度。 */
  readonly candidates: readonly { id: string; confidence: number }[];
}

/** 实体解析器。 */
export class EntityResolver {
  constructor(private readonly graph: KnowledgeGraphPort) {}

  /** 解析输入中的实体提及列表。 */
  resolve(text: string): readonly EntityMention[] {
    const tokens = tokenize(text);
    const mentions: EntityMention[] = [];
    for (const t of tokens) {
      const hits: { id: string; confidence: number }[] = [];
      for (const id of candidateIds(this.graph, t)) {
        const e = this.graph.getEntity(id);
        if (!e) continue;
        hits.push({ id, confidence: aliasScore(e, t) });
      }
      if (hits.length > 0) mentions.push({ surface: t, candidates: hits });
    }
    // TODO(infra): 用实体链接模型对候选做上下文消歧与重排
    return mentions;
  }

  /** 取置信度最高的规范化实体。 */
  resolveTop(text: string): readonly Entity[] {
    const out: Entity[] = [];
    for (const m of this.resolve(text)) {
      const best = [...m.candidates].sort((a, b) => b.confidence - a.confidence)[0];
      if (!best) continue;
      const e = this.graph.getEntity(best.id);
      if (e) out.push(e);
    }
    return out;
  }
}

function tokenize(text: string): readonly string[] {
  return text
    .split(/[\s,，。、;；:：]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function candidateIds(graph: KnowledgeGraphPort, token: string): readonly string[] {
  // 桩实现：无法枚举全部实体，故以邻居查询为空；真实实现需图谱全文索引。
  // TODO(infra): 以图库全文/向量索引按 token 召回候选 id
  void graph;
  void token;
  return [];
}

function aliasScore(e: Entity, token: string): number {
  return e.name.toLowerCase() === token.toLowerCase() ? 1 : 0.5;
}
