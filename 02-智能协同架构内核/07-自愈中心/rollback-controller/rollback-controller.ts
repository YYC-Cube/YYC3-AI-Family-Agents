/**
 * 回滚控制（rollback-controller）——「愈」支柱子模块。
 * 职责：**技能版本回滚 / 灰度回滚**（对接 §5.5 学习层与 §5.3 stability-guard）。
 * 边界：只执行回滚；学习退化检测归 05-持续学习引擎 stability-guard。
 *
 * v2.5.0（infra-4）转实——注入式执行器 + RTO 记账：
 *   - learning 层：委托注入的 SkillRollbackPort（部署侧桥接 05 SkillVersioner 状态翻转 /
 *     procedural-memory Git revert）；返回恢复到的版本号；
 *   - 其余层：委托注入的 InfraRollbackPort（部署侧桥接 K8s rollout undo 等灰度回滚）；
 *   - 计时记账：rtoSeconds 对照 RTO_RPO_TARGETS（learning 600s / infrastructure 60s）
 *     判 contractMet；RPO = 0（版本化永久，无数据丢失）；
 *   - 执行器抛错 → status='failed' 且 contractMet=false（绝不谎报愈合）。
 */

import { RTO_RPO_TARGETS } from '../types.js';
import type { FaultEvent, HealingOutcome } from '../types.js';

/** 技能版本回滚端口（部署侧桥接 05 skill-versioner / procedural-memory）。 */
export interface SkillRollbackPort {
  /** 回滚指定技能；返回恢复到的版本号（无可恢复为 undefined）。 */
  rollbackSkill(skillId: string, version?: string): string | undefined;
}

/** 基础设施灰度回滚端口（部署侧桥接 K8s rollout undo 等）。 */
export interface InfraRollbackPort {
  /** 对目标（服务/发布）执行灰度回滚。 */
  rollbackInfra(target: string): void;
}

/** 回滚执行器依赖（按层注入；缺省视为未装配）。 */
export interface RollbackDeps {
  readonly skill?: SkillRollbackPort;
  readonly infra?: InfraRollbackPort;
}

/** 回滚控制器。 */
export class RollbackController {
  constructor(private readonly deps: RollbackDeps = {}) { }

  /** 执行技能版本回滚（learning 层）或灰度回滚（其余层），并记账 RTO/RPO。 */
  rollback(fault: FaultEvent, target: string): HealingOutcome {
    const start = Date.now();
    const isLearning = fault.layer === 'learning';

    try {
      let detail: string;
      let restored: string | undefined;

      if (isLearning) {
        if (!this.deps.skill) throw new Error('未装配 SkillRollbackPort，无法执行技能回滚');
        restored = this.deps.skill.rollbackSkill(target);
        detail = restored
          ? `技能 ${target} 已回滚，恢复版本 ${restored}`
          : `技能 ${target} 已回滚（无可恢复的前置版本）`;
      } else {
        if (!this.deps.infra) throw new Error('未装配 InfraRollbackPort，无法执行灰度回滚');
        this.deps.infra.rollbackInfra(target);
        detail = `灰度回滚已执行：${target}`;
      }

      const rtoSeconds = (Date.now() - start) / 1000;
      const contract = RTO_RPO_TARGETS[fault.layer as 'infrastructure' | 'memory' | 'learning'];
      return {
        faultId: fault.id,
        actionId: `rollback-${fault.id}`,
        layer: fault.layer,
        status: 'healed',
        contractMet: contract ? rtoSeconds <= contract.rtoSeconds : true,
        rtoSeconds,
        rpoSeconds: 0,
        at: Date.now(),
        detail,
      };
    } catch (e) {
      const rtoSeconds = (Date.now() - start) / 1000;
      return {
        faultId: fault.id,
        actionId: `rollback-${fault.id}`,
        layer: fault.layer,
        status: 'failed',
        contractMet: false,
        rtoSeconds,
        rpoSeconds: 0,
        at: Date.now(),
        detail: `回滚失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }
}
