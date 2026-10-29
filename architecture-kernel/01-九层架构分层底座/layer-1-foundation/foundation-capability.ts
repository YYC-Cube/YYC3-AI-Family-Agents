/**
 * layer-1-foundation（第1层·基础底座）—— 公共基础设施能力底座。
 * 边界：仅暴露层级能力契约；本层无承载家人，也不 import 家人实现。
 *
 * TODO(infra): 接入公共基础设施（配置 / 日志 / 观测 / 存储连接池）健康探针。
 */

import type {
  CapabilityLayerId,
  LayerCapability,
  LayerDescriptor,
  LayerHealth,
  LayerProbe,
} from '../types.js';
import { LAYER_DESCRIPTORS } from '../types.js';

/** 基础底座能力（L1）。 */
export class FoundationCapability implements LayerCapability {
  readonly id: CapabilityLayerId = 'L1';

  /** 注入式健康探针（M29）：缺省恒 ok；部署侧接真实依赖探针（配置/日志/观测/存储）。 */
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
