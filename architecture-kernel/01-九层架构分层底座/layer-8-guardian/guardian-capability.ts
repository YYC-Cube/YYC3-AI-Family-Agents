/**
 * layer-8-guardian（第8层·智云·守护）—— 安全能力底座。
 * 边界：仅暴露层级能力契约；家人业务实现位于 `family-agents/`。
 *
 * TODO(infra): 抽取安全能力公共契约（UEBA / SOAR / 违规拦截）。
 */

import type { CapabilityLayerId, LayerCapability, LayerDescriptor, LayerHealth } from '../types.js';
import { LAYER_DESCRIPTORS } from '../types.js';

/** 安全能力底座（L8）。 */
export class GuardianCapability implements LayerCapability {
  readonly id: CapabilityLayerId = 'L8';

  describe(): LayerDescriptor {
    return { id: this.id, ...LAYER_DESCRIPTORS[this.id] };
  }

  async health(): Promise<LayerHealth> {
    // TODO(infra): 拦截数 / 误报率与安全策略同步探针
    return { status: 'ok' };
  }
}
