/**
 * 九层能力注册中心（layer-registry）—— P9-a（M29）· A 类骨架首批接线。
 * 职责：L1–L9 能力实例的注册 / 自描述 / 健康聚合（并行探测、单层异常隔离），
 *       供全局态势图消费（装配层把 healthAll 结果经 reportService 对接
 *       global-status-center，服务名 `layer-L1..L9`）。
 * 边界：只做注册与聚合；探针实现由部署侧/装配层注入（缺省恒 ok）；
 *       不 import 家人实现，不反向依赖 02/07。
 */

import type {
  CapabilityLayerId,
  LayerCapability,
  LayerDescriptor,
  LayerHealth,
  LayerProbe,
} from './types.js';
import { FoundationCapability } from './layer-1-foundation/foundation-capability.js';
import { BoleCapability } from './layer-2-bole/bole-capability.js';
import { ProphetCapability } from './layer-3-prophet/prophet-capability.js';
import { ThinkerCapability } from './layer-4-thinker/thinker-capability.js';
import { NavigatorCapability } from './layer-5-navigator/navigator-capability.js';
import { CreativeCapability } from './layer-6-creative/creative-capability.js';
import { MasterCapability } from './layer-7-master/master-capability.js';
import { GuardianCapability } from './layer-8-guardian/guardian-capability.js';
import { MetaOracleCapability } from './layer-9-meta-oracle/meta-oracle-capability.js';

/** 单层健康报告（健康聚合行）。 */
export interface LayerHealthReport {
  readonly id: CapabilityLayerId;
  readonly status: 'ok' | 'degraded' | 'down';
  readonly detail?: string;
}

/** 九层能力注册中心。 */
export class NineLayerRegistry {
  private readonly layers = new Map<CapabilityLayerId, LayerCapability>();

  /** 注册层级能力（同 id 重复注册视为装配错误）。 */
  register(capability: LayerCapability): void {
    if (this.layers.has(capability.id)) throw new Error(`层级重复注册：${capability.id}`);
    this.layers.set(capability.id, capability);
  }

  /** 按层级 ID 取能力实例。 */
  get(id: CapabilityLayerId): LayerCapability | undefined {
    return this.layers.get(id);
  }

  /** 全部层级（按 L1..L9 升序）。 */
  list(): readonly LayerCapability[] {
    return [...this.layers.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /** 全部描述符（自描述快照，L1..L9 序）。 */
  describeAll(): readonly LayerDescriptor[] {
    return this.list().map((capability) => capability.describe());
  }

  /**
   * 健康聚合：并行探测全部层级；单层探针异常降级为 `down`（带 detail），
   * 不拖垮其余层级——聚合结果供全局态势图最坏态推导。
   */
  async healthAll(): Promise<readonly LayerHealthReport[]> {
    return Promise.all(
      this.list().map(async (capability): Promise<LayerHealthReport> => {
        try {
          const health: LayerHealth = await capability.health();
          return { id: capability.id, status: health.status, detail: health.detail };
        } catch (error) {
          return {
            id: capability.id,
            status: 'down',
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
  }

  /** 静态默认装配：L1–L9 全量默认能力实例（probes 按 id 注入，缺省恒 ok）。 */
  static withDefaults(
    probes: Readonly<Partial<Record<CapabilityLayerId, LayerProbe>>> = {},
  ): NineLayerRegistry {
    const registry = new NineLayerRegistry();
    const defaults: readonly LayerCapability[] = [
      new FoundationCapability(probes.L1),
      new BoleCapability(probes.L2),
      new ProphetCapability(probes.L3),
      new ThinkerCapability(probes.L4),
      new NavigatorCapability(probes.L5),
      new CreativeCapability(probes.L6),
      new MasterCapability(probes.L7),
      new GuardianCapability(probes.L8),
      new MetaOracleCapability(probes.L9),
    ];
    for (const capability of defaults) registry.register(capability);
    return registry;
  }
}
