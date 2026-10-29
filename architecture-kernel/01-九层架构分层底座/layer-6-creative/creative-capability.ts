/**
 * layer-6-creative（第6层·创想·灵韵）—— 创意能力底座。
 * 边界：仅暴露层级能力契约；家人业务实现位于 `family-agents/`。
 *
 * TODO(infra): 抽取创意能力公共契约（创意润色 / 多模态生成）。
 */

import type {
  CapabilityLayerId,
  LayerCapability,
  LayerDescriptor,
  LayerHealth,
  LayerProbe,
} from '../types.js';
import { LAYER_DESCRIPTORS } from '../types.js';

/** 创意能力底座（L6）。 */
export class CreativeCapability implements LayerCapability {
  readonly id: CapabilityLayerId = 'L6';

  /** 注入式健康探针（M29）：缺省恒 ok；部署侧接真实依赖探针（生成成功率 / provider 可用性）。 */
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
