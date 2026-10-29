/**
 * 大枢自愈控制器（dashu-self-healing）—— K8s 扩缩容 / Pod 重建 / 降级 / 回滚。
 * 语义（M26 由桩转实）：
 *   - 注入式 `InfraActuator` 端口承载**基础设施执行**（K8s API / 服务网格由部署侧
 *     实现——内核零网络、不绑 K8s SDK）；controller 负责：动作计时（RTO 实测）、
 *     状态归一（actuator 成功 → healed，失败 → failed 如实上报，**不再假 healed**）、
 *     RTO/RPO 契约判定（契约经构造注入，未注入不判 contractMet=false）；
 *   - actuator 异常同样归一为 failed（detail 带错误信息），不向调用方抛出
 *     （自愈结果即接口——与 07 中心 outcome 语义一致）。
 * 边界：本控制器负责**基础设施层**自愈动作下发；对接 `architecture-kernel/07-自愈中心`
 *       （动作/结果的类型契约来自该中心）。策略判定归治理中心，业务补偿归各家人。
 */

import type { HealingAction, HealingOutcome, RtoRpoContract } from '../../07-自愈中心/types.js';

/** 基础设施执行器端口（部署侧实现：K8s API / 服务网格 / 容器运行时）。 */
export interface InfraActuator {
  /** 下发动作；resolve = 执行成功，reject/throw = 执行失败（controller 归一 outcome）。 */
  apply(action: HealingAction): Promise<{ detail?: string; rpoSeconds?: number }>;
}

/** 大枢自愈控制器（基础设施层）。 */
export class DashuSelfHealingController {
  /**
   * @param actuator 基础设施执行器（未注入时 apply 如实返回 failed——无执行通道）
   * @param contract RTO/RPO 契约（未注入时 contractMet 恒 false 且 rtoSeconds 仍实测）
   */
  constructor(
    private readonly actuator?: InfraActuator,
    private readonly contract?: RtoRpoContract,
  ) {}

  /** 下发基础设施自愈动作：计时执行 → 状态/契约归一（不抛出）。 */
  async apply(action: HealingAction): Promise<HealingOutcome> {
    const startedAt = Date.now();
    if (!this.actuator) {
      return {
        faultId: action.faultId,
        actionId: action.id,
        layer: action.layer,
        status: 'failed',
        contractMet: false,
        at: Date.now(),
        detail: '未注入 InfraActuator（基础设施执行通道未装配）',
      };
    }
    try {
      const result = await this.actuator.apply(action);
      const rtoSeconds = (Date.now() - startedAt) / 1000;
      const contractMet = this.contract ? rtoSeconds <= this.contract.rtoSeconds : false;
      return {
        faultId: action.faultId,
        actionId: action.id,
        layer: action.layer,
        status: 'healed',
        contractMet,
        rtoSeconds,
        ...(result.rpoSeconds !== undefined ? { rpoSeconds: result.rpoSeconds } : {}),
        at: Date.now(),
        detail: result.detail ?? `${action.kind}@${action.target} 已下发`,
      };
    } catch (error) {
      return {
        faultId: action.faultId,
        actionId: action.id,
        layer: action.layer,
        status: 'failed',
        contractMet: false,
        rtoSeconds: (Date.now() - startedAt) / 1000,
        at: Date.now(),
        detail: `actuator 执行失败：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
