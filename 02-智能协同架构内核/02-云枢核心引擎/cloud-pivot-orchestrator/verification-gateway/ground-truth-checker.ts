/**
 * ground-truth-checker（真实世界状态校验）——verification-gateway 子模块。
 * 职责：校验主张是否与**外部世界真实状态**一致，防「进展海市蜃楼」。
 * 边界：只做真值比对；置信度校准归 confidence-calibrator，裁决归天枢 / 人类。
 *
 * v2.3.0（Phase B 最小闭环）：支持注册可插拔探针（probe）——
 *   每个真值源可挂载 `(claim) => boolean | null` 探针函数，
 *   null 表示该源对此主张无意见；全部无意见时 **不默认成功**（verified=false）。
 * TODO(infra): 探针接入真实 oracle 连接（只读 DB / 外部 API / 人工确认工单）。
 */

import { OracleRegistry } from './oracle-registry.js';
import type { VerificationRequest, VerificationResult } from '../../types.js';

/** 真值探针：返回 true=证实 / false=驳斥 / null=无意见。 */
export type TruthProbe = (claim: string) => boolean | null;

/** 真实世界状态校验器。 */
export class GroundTruthChecker {
  private readonly registry: OracleRegistry;
  private readonly probes = new Map<string, TruthProbe>();

  constructor(registry?: OracleRegistry) {
    this.registry = registry ?? new OracleRegistry();
  }

  /** 为指定真值源挂载探针（同 id 重复注册以最后为准）。 */
  registerProbe(oracleId: string, probe: TruthProbe): void {
    this.probes.set(oracleId, probe);
  }

  /** 已挂载探针的真值源 id 清单。 */
  probedSources(): readonly string[] {
    return [...this.probes.keys()];
  }

  /**
   * 校验主张是否与真实世界状态一致。
   * 裁定规则（保守，防海市蜃楼）：
   *   - 至少一个源证实 且 无任何源驳斥 → verified=true，vConf 随证实源数 0.75→0.9；
   *   - 存在驳斥 → verified=false，vConf=0.8（驳斥置信度，供校准器强衰减）；
   *   - 无源命中/无意见 → verified=false（不默认成功）。
   * 注：VerificationResult.confidence 语义为「对该裁定本身的置信度」。
   */
  async check(request: VerificationRequest): Promise<VerificationResult> {
    const sources = this.registry.resolve(request.claim).filter((s) => this.probes.has(s.id));
    const verdicts: { id: string; value: boolean }[] = [];
    for (const source of sources) {
      const probe = this.probes.get(source.id)!;
      const v = probe(request.claim);
      if (v !== null) verdicts.push({ id: source.id, value: v });
    }

    if (verdicts.length === 0) {
      return {
        traceId: request.traceId,
        verified: false,
        sources: sources.map((s) => s.id),
        confidence: 0.4,
        detail: '无可探真值源命中：不默认成功（防海市蜃楼）',
      };
    }

    const yes = verdicts.filter((v) => v.value);
    const refuted = verdicts.length - yes.length;

    if (yes.length > 0 && refuted === 0) {
      // 证实：单源 0.75，多源每 +1 上调 0.05，封顶 0.9
      const vConf = Math.min(0.75 + 0.05 * (yes.length - 1), 0.9);
      return {
        traceId: request.traceId,
        verified: true,
        sources: yes.map((v) => v.id),
        confidence: vConf,
        detail: `${yes.length} 个真值源证实，0 驳斥`,
      };
    }

    return {
      traceId: request.traceId,
      verified: false,
      sources: verdicts.map((v) => v.id),
      confidence: 0.8,
      detail: `${refuted} 个真值源驳斥（证实现实状态与主张不一致）`,
    };
  }
}
