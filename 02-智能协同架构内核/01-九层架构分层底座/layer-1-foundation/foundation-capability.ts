/**
 * layer-1-foundation（第1层·基础底座）—— 公共基础设施能力底座。
 * 边界：仅暴露层级能力契约；本层无承载家人，也不 import 家人实现。
 *
 * TODO(infra): 接入公共基础设施（配置 / 日志 / 观测 / 存储连接池）健康探针。
 */

import type { CapabilityLayerId, LayerCapability, LayerDescriptor, LayerHealth } from '../types.js';
import { LAYER_DESCRIPTORS } from '../types.js';

/** 基础底座能力（L1）。 */
export class FoundationCapability implements LayerCapability {
  readonly id: CapabilityLayerId = 'L1';

  describe(): LayerDescriptor {
    return { id: this.id, ...LAYER_DESCRIPTORS[this.id] };
  }

  async health(): Promise<LayerHealth> {
    // TODO(infra): 聚合基础设施依赖（DB / Redis / 观测后端）探针结果
    return { status: 'ok' };
  }
}
