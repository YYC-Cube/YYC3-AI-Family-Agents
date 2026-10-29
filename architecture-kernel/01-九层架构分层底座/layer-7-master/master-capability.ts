/**
 * layer-7-master（第7层·格物·宗师）—— 质量能力底座。
 * 边界：仅暴露层级能力契约；家人业务实现位于 `family-agents/`。
 *
 * TODO(infra): 抽取质量能力公共契约（SAST / 黄金标准库 / 质量判定标签）。
 */

import type {
  CapabilityLayerId,
  LayerCapability,
  LayerDescriptor,
  LayerHealth,
  LayerProbe,
} from '../types.js';
import { LAYER_DESCRIPTORS } from '../types.js';

/** 质量能力底座（L7）。 */
export class MasterCapability implements LayerCapability {
  readonly id: CapabilityLayerId = 'L7';

  /** 注入式健康探针（M29）：缺省恒 ok；部署侧接真实依赖探针（门禁通过率 / 标准库一致性）。 */
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
