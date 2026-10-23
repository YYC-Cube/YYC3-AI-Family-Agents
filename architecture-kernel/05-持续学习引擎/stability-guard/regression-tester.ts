/**
 * 学习后回归（regression-tester）——「学」支柱 stability-guard 子模块。
 * 职责：学习后跑回归基线（tests/regression），判定新技能是否引入退化。
 * 边界：只回归与判定；回滚归 rollback-controller。
 *
 * v2.4.0（Phase C）实装（确定性、可注入）：
 *   - 用例执行由注入的 evaluate 函数完成（部署侧接 vitest / pytest 基线；
 *     测试环境用确定性模拟评估器）；
 *   - previouslyPassed 由可选基线给出（缺省视为全部曾通过——基线即"既有能力"）；
 *   - 判定：passRate ≥ minPassRate 且 **零新增退化**（曾通过用例本次失败）才放行。
 */

import type { RegressionCase, RegressionResult } from '../types.js';

/** 回归用例定义。 */
export interface RegressionTestCase {
  readonly id: string;
  readonly expected: string;
}

/** 用例评估函数：执行用例并返回实际输出（部署侧桥接真实回归基线）。 */
export type CaseEvaluator = (c: RegressionTestCase) => string;

/** 回归测试器。 */
export class RegressionTester {
  /** minPassRate：判定通过所需的最低通过率，默认 0.95。 */
  constructor(private readonly minPassRate = 0.95) { }

  /**
   * 运行回归并返回结果。
   * @param baseline 用例 id → 上次是否通过（缺省全 true：基线即既有能力）。
   */
  run(
    skillId: string,
    version: string,
    cases: readonly RegressionTestCase[],
    evaluate: CaseEvaluator,
    baseline?: ReadonlyMap<string, boolean>,
  ): RegressionResult {
    const regressions: RegressionCase[] = [];
    let passedCount = 0;

    for (const c of cases) {
      const actual = evaluate(c);
      const ok = actual === c.expected;
      if (ok) passedCount += 1;
      const previouslyPassed = baseline?.get(c.id) ?? true;
      if (!ok && previouslyPassed) {
        regressions.push({ id: c.id, expected: c.expected, actual, previouslyPassed });
      }
    }

    const total = cases.length;
    const passRate = total === 0 ? 1 : passedCount / total;
    return {
      skillId,
      skillVersion: version,
      passed: passRate >= this.minPassRate && regressions.length === 0,
      passRate,
      total,
      regressions,
      at: Date.now(),
    };
  }
}
