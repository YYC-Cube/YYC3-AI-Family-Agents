/**
 * 语义记忆（semantic-graph）——「知」支柱第 4 层。
 * 生命周期：永久（可遗忘）｜存储介质：图库 / 向量库｜写入触发：实体/关系确认。
 */

import { EntityResolver } from './entity-resolver.js';
import { KnowledgeGraph } from './knowledge-graph.js';
import type { MemoryHit, MemoryQuery } from '../types.js';

export { EntityResolver } from './entity-resolver.js';
export { KnowledgeGraph } from './knowledge-graph.js';
export type { Entity, Relation, Triple } from './knowledge-graph.js';
export type { EntityMention } from './entity-resolver.js';

/** 语义存储端口。 */
export interface SemanticStorePort {
  graph: KnowledgeGraph;
  resolver: EntityResolver;
  retrieve(query: MemoryQuery): readonly MemoryHit[];
}

/** 语义存储实现（内存桩）。 */
export class SemanticStore implements SemanticStorePort {
  readonly graph = new KnowledgeGraph();
  readonly resolver = new EntityResolver(this.graph);

  retrieve(query: MemoryQuery): readonly MemoryHit[] {
    const anchors = query.entities ?? (query.text ? this.resolver.resolveTop(query.text).map((e) => e.id) : []);
    const triples = this.graph.query(anchors);
    return triples.map<MemoryHit>((t, i) => ({
      layer: 'semantic',
      id: `sem-${t.subject.id}-${t.predicate}-${t.object.id}-${i}`,
      content: t,
      score: 0.8,
      salience: 0.7,
      recordTime: Date.now(),
    }));
  }
}
