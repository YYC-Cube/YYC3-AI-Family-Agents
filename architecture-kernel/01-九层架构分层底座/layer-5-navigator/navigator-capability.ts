/**
 * layer-5-navigator（第5层·言启·千行）—— 入口网关能力底座。
 * 边界：仅暴露层级能力契约；家人业务实现位于 `family-agents/`。
 *
 * TODO(infra): 抽取入口网关公共契约（意图/NLU + self-judge 置信度）。
 */

import type {
  CapabilityLayerId,
  LayerCapability,
  LayerDescriptor,
  LayerHealth,
  LayerProbe,
} from '../types.js';
import { LAYER_DESCRIPTORS } from '../types.js';

/** 入口网关能力底座（L5）。 */
export class NavigatorCapability implements LayerCapability {
  readonly id: CapabilityLayerId = 'L5';

  /** 注入式健康探针（M29）：缺省恒 ok；部署侧接真实依赖探针（意图延迟 < 200ms / 入口可用性）。 */
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
