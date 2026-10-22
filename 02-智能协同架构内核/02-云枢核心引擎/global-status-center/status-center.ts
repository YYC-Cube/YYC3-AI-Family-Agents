/**
 * 全局状态中心（global-status-center）—— 采集所有家人 / 服务 / 资源状态，构建全局态势图。
 * 边界：只做态势采集与聚合；故障处置归 07-自愈中心，策略裁决归治理中心。
 *
 * TODO(infra): 订阅总线心跳 + Prometheus 指标（§6.3），汇总为 GlobalSituation。
 */

import type {
  FamilyRuntimeStatus,
  GlobalSituation,
  ResourceStatus,
  ServiceStatus,
} from '../types.js';

/** 全局状态中心。 */
export class StatusCenter {
  private families: FamilyRuntimeStatus[] = [];
  private services: ServiceStatus[] = [];
  private resources: ResourceStatus[] = [];

  /** 上报家人状态（按 agent 去重）。 */
  reportFamily(status: FamilyRuntimeStatus): void {
    this.families = [...this.families.filter((item) => item.agent !== status.agent), status];
  }

  /** 上报服务状态。 */
  reportService(status: ServiceStatus): void {
    this.services = [...this.services.filter((item) => item.name !== status.name), status];
  }

  /** 上报资源状态。 */
  reportResource(status: ResourceStatus): void {
    this.resources = [...this.resources.filter((item) => item.resource !== status.resource), status];
  }

  /** 构建全局态势图。 */
  snapshot(): GlobalSituation {
    // TODO(infra): 依据 SLO 违约与健康探针计算 overall 等级
    return {
      at: Date.now(),
      families: this.families,
      services: this.services,
      resources: this.resources,
      overall: 'ok',
    };
  }
}
