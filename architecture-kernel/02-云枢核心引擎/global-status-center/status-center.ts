/**
 * 全局状态中心（global-status-center）—— 采集所有家人 / 服务 / 资源状态，构建全局态势图。
 * 语义（M26 由桩转实）：overall 由上报态推导——
 *   - 任一 family/service `down` → overall `down`；
 *   - 否则任一 family/service `degraded`，或任一资源 usedRatio ≥ pressureThreshold
 *     （缺省 0.9）→ `degraded`；
 *   - 全绿（或零上报）→ `ok`（零上报不告警，空态势合法）。
 * 边界：只做态势采集与聚合；故障处置归 07-自愈中心，策略裁决归治理中心。
 * 后续（planned）：订阅总线心跳与 Prometheus §6.3 指标自动上报（report* 入口已就绪）。
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

  constructor(private readonly pressureThreshold = 0.9) {}

  /** 上报家人状态（按 agent 去重）。 */
  reportFamily(status: FamilyRuntimeStatus): void {
    this.families = [...this.families.filter((item) => item.agent !== status.agent), status];
  }

  /** 上报服务状态（按 name 去重）。 */
  reportService(status: ServiceStatus): void {
    this.services = [...this.services.filter((item) => item.name !== status.name), status];
  }

  /** 上报资源状态（按 resource 去重）。 */
  reportResource(status: ResourceStatus): void {
    this.resources = [...this.resources.filter((item) => item.resource !== status.resource), status];
  }

  /** 构建全局态势图（overall 按最坏态推导；down > degraded > ok）。 */
  snapshot(now: number = Date.now()): GlobalSituation {
    const worst = (levels: readonly ('ok' | 'degraded' | 'down')[]): 'ok' | 'degraded' | 'down' => {
      if (levels.includes('down')) return 'down';
      if (levels.includes('degraded')) return 'degraded';
      return 'ok';
    };
    const familyLevels = this.families.map((f) => f.status);
    const serviceLevels = this.services.map((s) => s.status);
    const resourcePressure = this.resources.some((r) => r.usedRatio >= this.pressureThreshold);

    const overall = worst([
      ...familyLevels,
      ...serviceLevels,
      ...(resourcePressure ? (['degraded'] as const) : []),
    ]);

    return {
      at: now,
      families: this.families,
      services: this.services,
      resources: this.resources,
      overall,
    };
  }
}
