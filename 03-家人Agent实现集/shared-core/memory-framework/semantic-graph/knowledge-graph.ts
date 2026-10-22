/**
 * 知识图谱（knowledge-graph）——「知」支柱 semantic-graph 子模块。
 * 职责：承载实体（Entity）、关系（Relation）、画像（Profile）与领域知识。
 * 生命周期：永久（可遗忘）｜存储介质：图库 / 向量库｜写入触发：实体/关系确认。
 *
 * TODO(infra): 落地为图数据库（Neo4j / 属性图）+ 向量库（Milvus/pgvector）双写。
 */

/** 实体节点。 */
export interface Entity {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

/** 关系边。 */
export interface Relation {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly predicate: string;
  /** 关系强度/置信度 0–1。 */
  readonly weight: number;
}

/** 三元组（供学习引擎 pattern-extractor 复用）。 */
export interface Triple {
  readonly subject: Entity;
  readonly predicate: string;
  readonly object: Entity;
}

/** 知识图谱端口。 */
export interface KnowledgeGraphPort {
  upsertEntity(entity: Entity): Entity;
  upsertRelation(relation: Relation): Relation;
  getEntity(id: string): Entity | undefined;
  neighbors(id: string): readonly Relation[];
  query(entities: readonly string[]): readonly Triple[];
}

/**
 * 知识图谱实现（内存桩）。
 * 以邻接表承载实体与关系，支持实体锚点查询。
 */
export class KnowledgeGraph implements KnowledgeGraphPort {
  private readonly entities = new Map<string, Entity>();
  private readonly relations = new Map<string, Relation>();

  upsertEntity(entity: Entity): Entity {
    this.entities.set(entity.id, entity);
    // TODO(infra): 写入图库节点 + 向量库嵌入
    return entity;
  }

  upsertRelation(relation: Relation): Relation {
    this.relations.set(relation.id, relation);
    // TODO(infra): 写入图库边
    return relation;
  }

  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  neighbors(id: string): readonly Relation[] {
    return [...this.relations.values()].filter((r) => r.fromId === id || r.toId === id);
  }

  query(entities: readonly string[]): readonly Triple[] {
    const out: Triple[] = [];
    for (const eid of entities) {
      for (const r of this.neighbors(eid)) {
        const s = this.entities.get(r.fromId);
        const o = this.entities.get(r.toId);
        if (s && o && r.fromId === eid) {
          out.push({ subject: s, predicate: r.predicate, object: o });
        }
      }
    }
    return out;
  }
}
