/**
 * 一致性修复（consistency-repair）——「愈」支柱子模块。
 * 职责：记忆跨层不一致时，**回滚至一致性快照修复**（RPO=0，配合 memory-orchestrator）。
 * 边界：只修复记忆一致性；策略判定归治理中心，业务补偿归各家人。
 *
 * v2.5.0（Phase D）转实——快照增量修复 + RTO 记账（契约：memory RTO ≤ 300s / RPO = 0）：
 *   - 对 repairable 问题逐条委托注入的 IssueRepairer 执行快照增量修复（仅修受影响条目）；
 *   - 不可修复问题（repairable=false）或修复失败 → status='escalated' 上报人工/治理；
 *   - rtoSeconds 记账实际修复耗时并对照 RTO_RPO_TARGETS.memory 判 contractMet。
 * TODO(infra): 快照存储与增量比对（当前由部署侧 IssueRepairer 实现快照回滚细节）。
 */

import type { ConsistencyIssue, ConsistencyReport } from '@shared/memory-framework';
import { RTO_RPO_TARGETS } from '../types.js';
import type { HealingOutcome } from '../types.js';

/** 单条问题修复执行器（部署侧实现快照回滚/增量修复细节）。 */
export interface IssueRepairer {
  /** 对单个可修复问题执行修复；返回是否成功。 */
  repairIssue(issue: ConsistencyIssue): boolean;
}

/** 一致性修复器。 */
export class ConsistencyRepair {
  constructor(private readonly repairer?: IssueRepairer) { }

  /** 依据一致性报告执行修复并记账 RTO/RPO。 */
  repair(report: ConsistencyReport): HealingOutcome {
    const start = Date.now();
    const faultId = `consistency-${report.checkedAt}`;

    if (report.ok) {
      return {
        faultId,
        actionId: 'snapshot-repair',
        layer: 'memory',
        status: 'healed',
        contractMet: true,
        rtoSeconds: 0,
        rpoSeconds: 0,
        at: Date.now(),
        detail: '一致性校验通过，无需修复',
      };
    }

    const repairable = report.issues.filter((i) => i.repairable);
    const unrepairable = report.issues.filter((i) => !i.repairable);

    // 快照增量修复：仅修受影响条目
    let repaired = 0;
    for (const issue of repairable) {
      if (this.repairer?.repairIssue(issue)) repaired += 1;
    }

    const rtoSeconds = (Date.now() - start) / 1000;
    const contract = RTO_RPO_TARGETS.memory;
    const status: HealingOutcome['status'] =
      unrepairable.length > 0
        ? 'escalated' // 存在不可自动修复项 → 上报人工
        : repaired === repairable.length
          ? 'healed'
          : repaired > 0
            ? 'degraded'
            : 'escalated'; // 无执行器或全部失败 → 上报

    return {
      faultId,
      actionId: 'snapshot-repair',
      layer: 'memory',
      status,
      contractMet: rtoSeconds <= contract.rtoSeconds,
      rtoSeconds,
      rpoSeconds: contract.rpoSeconds,
      at: Date.now(),
      detail:
        `快照增量修复：成功 ${repaired}/${repairable.length}，待人工 ${unrepairable.length}` +
        `${this.repairer ? '' : '（未注入修复执行器，仅上报）'}`,
    };
  }
}
