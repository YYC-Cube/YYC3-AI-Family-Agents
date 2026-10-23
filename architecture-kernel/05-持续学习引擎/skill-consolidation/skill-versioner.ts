/**
 * 技能版本化（skill-versioner）——「学」支柱 skill-consolidation 子模块。
 * 职责：版本分配、多版本共存、回滚（对接 §5.5 学习回滚）。
 * 边界：只管理版本与回滚决策；实际落盘归 procedural-memory（Git 版本化 YAML）。
 *
 * v2.4.0（Phase C）实装：
 *   - nextVersion(current, changeType)：major/minor/patch 语义化递增；
 *   - rollback(history)：当前最高 active 版本 → rolled-back，其前一 active 版本
 *     恢复为 active（多版本共存，历史可审计）。
 * TODO(infra): 落盘侧 Git tag 回退通知 + 冻结相关学习任务（对接 stability-guard）。
 */

import type { SkillDefinition } from '../types.js';

/** 变更类型（决定版本号位递增）。 */
export type SkillChangeType = 'major' | 'minor' | 'patch';

/** 回滚结果：翻转状态后的完整历史 + 恢复的版本。 */
export interface RollbackOutcome {
  /** 状态翻转后的历史（原数组不被修改）。 */
  readonly history: SkillDefinition[];
  /** 恢复为 active 的版本（无前置版本时 undefined）。 */
  readonly restored?: SkillDefinition;
}

/** 技能版本管理器。 */
export class SkillVersioner {
  /** 为技能分配下一版本号（默认 minor：能力演进；破坏性变更用 major）。 */
  nextVersion(current: string, changeType: SkillChangeType = 'minor'): string {
    const parts = current.split('.').map((p) => Number.parseInt(p, 10) || 0);
    const major = parts[0] ?? 1;
    const minor = parts[1] ?? 0;
    const patch = parts[2] ?? 0;
    switch (changeType) {
      case 'major':
        return `${major + 1}.0.0`;
      case 'patch':
        return `${major}.${minor}.${patch + 1}`;
      default:
        return `${major}.${minor + 1}.0`;
    }
  }

  /** 语义化版本比较：a>b 返回正数，a=b 返回 0，a<b 返回负数。 */
  compareSemver(a: string, b: string): number {
    const pa = a.split('.').map((p) => Number.parseInt(p, 10) || 0);
    const pb = b.split('.').map((p) => Number.parseInt(p, 10) || 0);
    for (let i = 0; i < 3; i += 1) {
      const d = (pa[i] ?? 0) - (pb[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  }

  /**
   * 回滚：当前最高 active 版本置 rolled-back，前一 active 版本恢复 active。
   * 不修改入参（SkillDefinition 只读），返回翻转后的新历史。
   */
  rollback(history: readonly SkillDefinition[]): RollbackOutcome {
    const actives = history
      .filter((s) => s.status === 'active')
      .sort((a, b) => this.compareSemver(b.version, a.version));
    if (actives.length === 0) return { history: [...history] };

    const current = actives[0]!;
    const previous = actives[1];

    const next = history.map((s) => {
      if (s.id === current.id && s.version === current.version) {
        return { ...s, status: 'rolled-back' as const };
      }
      if (previous && s.id === previous.id && s.version === previous.version) {
        return { ...s, status: 'active' as const };
      }
      return s;
    });
    return { history: next, restored: previous };
  }
}
