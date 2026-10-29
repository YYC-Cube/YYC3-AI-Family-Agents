/**
 * layer-4-thinker（第4层·语枢·万物）—— 分析能力底座。
 * 边界：仅暴露层级能力契约；家人业务实现位于 `family-agents/`。
 *
 * TODO(infra): 抽取分析能力公共契约（数据分析标准化工作流，可承接交叉复核）。
 */

import type {
  CapabilityLayerId,
  LayerCapability,
  LayerDescriptor,
  LayerHealth,
  LayerProbe,
} from '../types.js';
import { LAYER_DESCRIPTORS } from '../types.js';

/** 分析能力底座（L4）。 */
export class ThinkerCapability implements LayerCapability {
  readonly id: CapabilityLayerId = 'L4';

  /** 注入式健康探针（M29）：缺省恒 ok；部署侧接真实依赖探针（成功率 / 记忆检索依赖）。 */
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
