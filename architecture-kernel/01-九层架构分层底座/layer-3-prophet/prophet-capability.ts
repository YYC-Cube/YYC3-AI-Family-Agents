/**
 * layer-3-prophet（第3层·预见·先知）—— 预测能力底座。
 * 边界：仅暴露层级能力契约；家人业务实现位于 `family-agents/`。
 *
 * TODO(infra): 抽取预测能力公共契约（趋势 / 风险前置识别）。
 */

import type { CapabilityLayerId, LayerCapability, LayerDescriptor, LayerHealth } from '../types.js';
import { LAYER_DESCRIPTORS } from '../types.js';

/** 预测能力底座（L3）。 */
export class ProphetCapability implements LayerCapability {
  readonly id: CapabilityLayerId = 'L3';

  describe(): LayerDescriptor {
    return { id: this.id, ...LAYER_DESCRIPTORS[this.id] };
  }

  async health(): Promise<LayerHealth> {
    // TODO(infra): 预测命中率与预测延迟探针
    return { status: 'ok' };
  }
}
