/**
 * layer-5-navigator（第5层·言启·千行）—— 入口网关能力底座。
 * 边界：仅暴露层级能力契约；家人业务实现位于 `03-家人Agent实现集/`。
 *
 * TODO(infra): 抽取入口网关公共契约（意图/NLU + self-judge 置信度）。
 */

import type { CapabilityLayerId, LayerCapability, LayerDescriptor, LayerHealth } from '../types.js';
import { LAYER_DESCRIPTORS } from '../types.js';

/** 入口网关能力底座（L5）。 */
export class NavigatorCapability implements LayerCapability {
  readonly id: CapabilityLayerId = 'L5';

  describe(): LayerDescriptor {
    return { id: this.id, ...LAYER_DESCRIPTORS[this.id] };
  }

  async health(): Promise<LayerHealth> {
    // TODO(infra): 意图识别延迟（< 200ms）与入口可用性探针
    return { status: 'ok' };
  }
}
