/**
 * layer-9-meta-oracle（第9层·元启·天枢）—— 全局调度能力底座。
 * 边界：仅暴露层级能力契约；家人业务实现位于 `family-agents/`。
 *       编排/调度**具体实现**位于 `02-云枢核心引擎/cloud-pivot-orchestrator/`。
 *
 * TODO(infra): 抽取全局调度公共契约（工作流编排 / 家人调度 / 最终裁决入口）。
 */

import type {
  CapabilityLayerId,
  LayerCapability,
  LayerDescriptor,
  LayerHealth,
  LayerProbe,
} from '../types.js';
import { LAYER_DESCRIPTORS } from '../types.js';

/** 全局调度能力底座（L9）。 */
export class MetaOracleCapability implements LayerCapability {
  readonly id: CapabilityLayerId = 'L9';

  /** 注入式健康探针（M29）：缺省恒 ok；部署侧接真实依赖探针（调度成功率 / 态势可用性）。 */
  constructor(private readonly probe?: LayerProbe) {}

  describe(): LayerDescriptor {
    return { id: this.id, ...LAYER_DESCRIPTORS[this.id] };
  }

  async health(): Promise<LayerHealth> {
    if (!this.probe) return { status: 'ok' };
    try {
      return await this.probe();
    } catch (error) {
      return { status: 'down', detail: error instanceof Error ? error.message : String(error) };
    }
  }
}
