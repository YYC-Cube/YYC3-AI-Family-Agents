/**
 * layer-2-bole（第2层·千里·伯乐）—— 推荐能力底座。
 * 边界：仅暴露层级能力契约；家人业务实现位于 `family-agents/`。
 *
 * TODO(infra): 抽取推荐能力公共契约（个性化排序 / 结果交付呈现）。
 */

import type { CapabilityLayerId, LayerCapability, LayerDescriptor, LayerHealth } from '../types.js';
import { LAYER_DESCRIPTORS } from '../types.js';

/** 推荐能力底座（L2）。 */
export class BoleCapability implements LayerCapability {
  readonly id: CapabilityLayerId = 'L2';

  describe(): LayerDescriptor {
    return { id: this.id, ...LAYER_DESCRIPTORS[this.id] };
  }

  async health(): Promise<LayerHealth> {
    // TODO(infra): 推荐质量（点击/采纳率）与延迟 P99 探针
    return { status: 'ok' };
  }
}
