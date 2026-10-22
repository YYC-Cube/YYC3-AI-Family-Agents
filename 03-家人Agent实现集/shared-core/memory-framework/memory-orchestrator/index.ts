/**
 * 记忆编排器（memory-orchestrator）——「知」支柱的编排层（§5.1）。
 * 职责：统一检索入口、写入落库、遗忘执行、跨层一致性校验。
 * 组合：retrieval-router（路由）+ 各层 store + write-policy + consistency-checker。
 *
 * 数据流（§5.1 记忆写入）：
 *   家人执行 → 结果产出 → self-judge 输出 JudgmentSignal → 总线 task.completed
 *   → write-policy.salience-scorer 评分 → consolidation 巩固 → commit → 分层落库 → WriteAck
 */

import { EpisodicStore, type EpisodicStorePort } from '../episodic-store/index.js';
import { ProceduralStore, type ProceduralStorePort } from '../procedural-memory/index.js';
import { SensoryBuffer, type SensoryBufferPort } from '../sensory-buffer/index.js';
import { SemanticStore, type SemanticStorePort } from '../semantic-graph/index.js';
import { WritePolicy } from '../write-policy/index.js';
import { WorkingContext, type WorkingContextPort } from '../working-context/index.js';
import { ConsistencyChecker, type LayerSnapshot } from './consistency-checker.js';
import { RetrievalRouter } from './retrieval-router.js';
import type {
  ForgetAck,
  ForgetDetail,
  MemoryBundle,
  MemoryHit,
  MemoryLayer,
  MemoryOrchestrator,
  MemoryQuery,
  MemoryScope,
  MemoryWriteRequest,
  WriteAck,
  ConsistencyReport,
  ForgettingPolicy,
  TaskContext,
} from '../types.js';

export { RetrievalRouter, DEFAULT_ROUTING } from './retrieval-router.js';
export { ConsistencyChecker } from './consistency-checker.js';
export type { LayerSnapshot } from './consistency-checker.js';

/** 编排器依赖（可注入真实基础设施实现）。 */
export interface MemoryOrchestratorDeps {
  readonly sensory?: SensoryBufferPort;
  readonly working?: WorkingContextPort;
  readonly episodic?: EpisodicStorePort;
  readonly semantic?: SemanticStorePort;
  readonly procedural?: ProceduralStorePort;
  readonly writePolicy?: WritePolicy;
  readonly router?: RetrievalRouter;
  readonly checker?: ConsistencyChecker;
}

/** 编排器内部的写入台账（用于遗忘与一致性校验）。 */
interface CommittedRecord {
  readonly id: string;
  readonly layer: MemoryLayer;
  readonly salience: number;
  readonly eventTime: number;
  lastAccessTs: number;
}

/**
 * 记忆编排器实现。
 * 桩实现以内存台账承载已提交记录，真实实现应把台账替换为分层存储查询。
 */
export class MemoryOrchestratorImpl implements MemoryOrchestrator {
  private readonly sensory: SensoryBufferPort;
  private readonly working: WorkingContextPort;
  private readonly episodic: EpisodicStorePort;
  private readonly semantic: SemanticStorePort;
  private readonly procedural: ProceduralStorePort;
  private readonly writePolicy: WritePolicy;
  private readonly router: RetrievalRouter;
  private readonly checker: ConsistencyChecker;
  private readonly ledger: CommittedRecord[] = [];
  private seq = 0;

  constructor(deps: MemoryOrchestratorDeps = {}) {
    this.sensory = deps.sensory ?? new SensoryBuffer();
    this.working = deps.working ?? new WorkingContext();
    this.episodic = deps.episodic ?? new EpisodicStore();
    this.semantic = deps.semantic ?? new SemanticStore();
    this.procedural = deps.procedural ?? new ProceduralStore();
    this.writePolicy = deps.writePolicy ?? new WritePolicy();
    this.router = deps.router ?? new RetrievalRouter();
    this.checker = deps.checker ?? new ConsistencyChecker();
  }

  async retrieve(query: MemoryQuery, ctx: TaskContext): Promise<MemoryBundle> {
    const layers = this.router.route(ctx, query.layers);
    const now = Date.now();
    const hits: MemoryHit[] = [];
    const layerStats: Partial<Record<MemoryLayer, number>> = {};

    for (const layer of layers) {
      const produced = this.retrieveLayer(layer, query, now);
      layerStats[layer] = produced.length;
      hits.push(...produced);
    }

    const limit = query.limit ?? ctx.budget?.maxItems ?? 50;
    const ranked = hits
      .filter((h) => h.score >= (query.minScore ?? 0))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // TODO(infra): 检索延迟接入可观测（目标 < 300ms，§6.1）
    return {
      query,
      hits: ranked,
      traceId: ctx.traceId,
      ts: now,
      layerStats,
    };
  }

  async commit(req: MemoryWriteRequest): Promise<WriteAck> {
    const decision = this.writePolicy.evaluate(req);
    if (!decision.accepted) {
      return {
        accepted: false,
        layer: req.layer,
        traceId: req.provenance.traceId,
        salience: decision.salience,
        committedAt: Date.now(),
        reason: decision.reason,
      };
    }

    this.seq += 1;
    const id = `mem-${req.layer}-${req.provenance.traceId}-${this.seq}`;
    const ts = req.provenance.ts || Date.now();

    // 分层落库（桩：episodic 记录轨迹；其余入台账，待真实存储接入）
    if (req.layer === 'episodic') {
      this.episodic.record({
        traceId: req.provenance.traceId,
        agent: req.provenance.agent,
        eventTime: ts,
        type: 'memory.commit',
        payload: req.payload,
      });
    }
    this.ledger.push({
      id,
      layer: req.layer,
      salience: decision.salience,
      eventTime: ts,
      lastAccessTs: ts,
    });
    // TODO(infra): semantic → 图库/向量库 upsert；procedural → Git YAML 版本化落库

    return {
      accepted: true,
      layer: req.layer,
      traceId: req.provenance.traceId,
      salience: decision.salience,
      committedAt: Date.now(),
      id,
    };
  }

  async forget(policy: ForgettingPolicy): Promise<ForgetAck> {
    const now = Date.now();
    const details: ForgetDetail[] = [];
    const kept: CommittedRecord[] = [];
    for (const rec of this.ledger) {
      const decay = this.writePolicy.forgetting.evaluate(
        {
          id: rec.id,
          layer: rec.layer,
          salience: rec.salience,
          eventTime: rec.eventTime,
          lastAccessTs: rec.lastAccessTs,
        },
        policy,
        now,
      );
      if (decay.shouldForget) {
        details.push({ id: rec.id, layer: rec.layer, reason: decay.reason });
        // TODO(infra): hardDelete ? 物理删除 : 软删除/降权
      } else {
        kept.push(rec);
      }
    }
    this.ledger.length = 0;
    this.ledger.push(...kept);

    return {
      forgotten: details.length,
      layers: policy.layers ?? (['sensory', 'working', 'episodic', 'semantic', 'procedural'] as const),
      traceId: `forget-${now}`,
      ts: now,
      details,
    };
  }

  async checkConsistency(scope: MemoryScope): Promise<ConsistencyReport> {
    const byLayer = new Map<MemoryLayer, { id: string }[]>();
    for (const rec of this.ledger) {
      const bucket = byLayer.get(rec.layer) ?? [];
      bucket.push({ id: rec.id });
      byLayer.set(rec.layer, bucket);
    }
    const snapshots: LayerSnapshot[] = [...byLayer.entries()].map(([layer, records]) => ({
      layer,
      records,
    }));
    return this.checker.check(scope, snapshots);
  }

  /** 单层检索分派。 */
  private retrieveLayer(layer: MemoryLayer, query: MemoryQuery, now: number): MemoryHit[] {
    switch (layer) {
      case 'sensory':
        return this.sensory.recent(query.limit).map((s) => ({
          layer: 'sensory',
          id: s.id,
          content: s.content,
          score: 0.4,
          salience: 0.3,
          eventTime: s.ts,
        }));
      case 'working':
        return this.working.attend(query.text ?? '', now).selected.map((c) => ({
          layer: 'working',
          id: c.id,
          content: c.content,
          score: c.weight,
          salience: c.weight,
          eventTime: now,
        }));
      case 'episodic':
        return [...this.episodic.retrieve(query)];
      case 'semantic':
        return [...this.semantic.retrieve(query)];
      case 'procedural':
        return [...this.procedural.retrieve(query)];
      default:
        return [];
    }
  }
}
