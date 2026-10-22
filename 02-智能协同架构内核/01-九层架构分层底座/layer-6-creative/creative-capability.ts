/**
 * layer-6-creative（第6层·创想·灵韵）—— 创意能力底座。
 * 边界：仅暴露层级能力契约；家人业务实现位于 `03-家人Agent实现集/`。
 *
 * TODO(infra): 抽取创意能力公共契约（创意润色 / 多模态生成）。
 */

import type { CapabilityLayerId, LayerCapability, LayerDescriptor, LayerHealth } from '../types.js';
import { LAYER_DESCRIPTORS } from '../types.js';

/** 创意能力底座（L6）。 */
export class CreativeCapability implements LayerCapability {
  readonly id: CapabilityLayerId = 'L6';

  describe(): LayerDescriptor {
    return { id: this.id, ...LAYER_DESCRIPTORS[this.id] };
  }

  async health(): Promise<LayerHealth> {
    // TODO(infra): 创意生成成功率与模型 provider 可用性探针
    return { status: 'ok' };
  }
}
