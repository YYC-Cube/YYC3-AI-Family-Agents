/**
 * layer-8-guardian（第8层·智云·守护）—— 安全能力底座。
 * 边界：仅暴露层级能力契约；家人业务实现位于 `family-agents/`。
 *
 * TODO(infra): 抽取安全能力公共契约（UEBA / SOAR / 违规拦截）。
 */

import type {
  CapabilityLayerId,
  LayerCapability,
  LayerDescriptor,
  LayerHealth,
  LayerProbe,
} from '../types.js';
import { LAYER_DESCRIPTORS } from '../types.js';

/** 安全能力底座（L8）。 */
export class GuardianCapability implements LayerCapability {
  readonly id: CapabilityLayerId = 'L8';

  /** 注入式健康探针（M29）：缺省恒 ok；部署侧接真实依赖探针（拦截/误报率 / 策略同步）。 */
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
