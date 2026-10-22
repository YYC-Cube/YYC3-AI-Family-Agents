/**
 * 参数级适应边界（param-adaptation）——「学」支柱 Phase E 可选项的**契约护栏**（§5.3 / §6.4 Phase E）。
 *
 * v2.5.0（Phase E）护栏定版：
 *   本版本对参数级适应（权重微调）执行「**只准入评估、永不执行**」护栏——
 *   任何提案无论资料多完备，Gate 一律返回 allowed=false。
 *   依据：
 *     1) §5.3 边界红线：本引擎只负责程序性/语义知识沉淀，权重微调不阻塞落地；
 *     2) 「稳定性—可塑性」约束：参数级变更缺少本仓已验证的回归门禁等价物
 *        （技能回滚可逆，权重回滚不可逆且影响面全局）；
 *     3) Phase E 验收「参数级学习不破坏稳定性」——最不破坏的方式即不执行。
 *   未来放行条件（PARAM_ADAPTATION_CONTRACT.unblockPreconditions）全部落地并经治理中心审核后才允许翻转。
 */

/** 参数级适应提案（准入评估对象）。 */
export interface ParamAdaptationProposal {
  readonly id: string;
  /** 基座模型标识。 */
  readonly baseModel: string;
  /** 训练数据集引用（可审计溯源）。 */
  readonly datasetRef: string;
  /** 适应目标声明。 */
  readonly objective: string;
  /** 预算上限（token）。 */
  readonly budgetTokens: number;
  readonly requestedBy: string;
  readonly requestedAt: number;
}

/** 准入审查明细项。 */
export interface AdaptationCheckItem {
  readonly item: string;
  readonly met: boolean;
}

/** 裁决结果。 */
export interface ParamAdaptationVerdict {
  readonly proposalId: string;
  /** 护栏位：本版本恒为 false（永不执行权重更新）。 */
  readonly allowed: boolean;
  readonly reason: string;
  readonly checkedItems: readonly AdaptationCheckItem[];
}

/** 参数级适应契约（放行前提与硬上限）。 */
export const PARAM_ADAPTATION_CONTRACT = {
  /** 护栏版本：v1 = 仅准入评估。 */
  guardrailVersion: 'v1-evaluate-only',
  /** 单提案预算硬上限（token）。 */
  maxBudgetTokens: 1_000_000,
  /** 数据集最低规模（样本数）——资料完备性审查项。 */
  minDatasetSamples: 1000,
  /** 放行前提（全部满足且经 06-治理中心审核后才可翻转载决）。 */
  unblockPreconditions: [
    '等价回归门禁：参数级变更须通过与技能同级的能力基线回归（零新增退化）',
    '可逆回滚：checkpoint 级回滚机制与演练记录（RTO 契约对齐 §5.5）',
    '不可篡改审计：训练数据、超参、产物哈希入 compliance-audit 审计链',
    '灰度隔离：影子评估环境先行，禁止直接覆盖生产权重',
    '治理审核：06-治理中心策略裁决（allow-with-audit）留痕',
  ],
} as const;

/** 参数级适应准入门（护栏实现）。 */
export class ParamAdaptationGate {
  /**
   * 准入评估：逐项审查资料完备性（为未来放行积累审查事实），
   * 但**无论结果如何一律拒绝执行**（护栏红线，见文件头 v2.5.0 说明）。
   */
  evaluate(proposal: ParamAdaptationProposal): ParamAdaptationVerdict {
    const checkedItems: AdaptationCheckItem[] = [
      { item: 'dataset-declared', met: proposal.datasetRef.trim().length > 0 },
      { item: 'objective-declared', met: proposal.objective.trim().length > 0 },
      {
        item: 'budget-capped',
        met: proposal.budgetTokens > 0 && proposal.budgetTokens <= PARAM_ADAPTATION_CONTRACT.maxBudgetTokens,
      },
    ];
    return {
      proposalId: proposal.id,
      allowed: false,
      reason:
        `护栏 ${PARAM_ADAPTATION_CONTRACT.guardrailVersion}：参数级适应仅准入评估，永不执行权重更新。` +
        '程序性沉淀（skill-consolidation）与语义更新（knowledge-update）已覆盖当前学习需求；' +
        `放行前提共 ${PARAM_ADAPTATION_CONTRACT.unblockPreconditions.length} 项，须全部落地并经治理中心审核。`,
      checkedItems,
    };
  }
}
