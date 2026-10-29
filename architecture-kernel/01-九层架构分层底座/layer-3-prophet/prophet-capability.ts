/**
 * layer-3-prophet（第3层·预见·先知）—— 预测能力底座。
 * 边界：仅暴露层级能力契约；家人业务实现位于 `family-agents/`。
 *
 * TODO(infra): 抽取预测能力公共契约（趋势 / 风险前置识别）。
 */

import type {
  CapabilityLayerId,
  LayerCapability,
  LayerDescriptor,
  LayerHealth,
  LayerProbe,
} from '../types.js';
import { LAYER_DESCRIPTORS } from '../types.js';

/** 预测能力底座（L3）。 */
export class ProphetCapability implements LayerCapability {
  readonly id: CapabilityLayerId = 'L3';

  /** 注入式健康探针（M29）：缺省恒 ok；部署侧接真实依赖探针（命中率 / 预测延迟）。 */
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
