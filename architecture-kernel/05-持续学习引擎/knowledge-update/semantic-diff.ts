/**
 * 语义差异（semantic-diff）——「学」支柱 knowledge-update 子模块。
 * 职责：检测新知识与既有**语义记忆**的冲突 / 过时。
 * 边界：只检测与上报；冲突修复归 stability-guard 回归与自愈中心。
 *
 * v2.5.0（Phase E）转实——确定性键值冲突检测（可审计、可回归）：
 *   - 事实格式约定 `subject|attribute|value`（无分隔符则整句归一化后为键、空值）；
 *   - 同键同值 → 一致（无差异）；同键异值：
 *       · incoming 值**包含**既有值（细化/补充表述）→ 'superseded'（旧表述被更完整版取代）；
 *       · 否则 → 'contradiction'（直接矛盾，severity high，repairable 交自愈中心）；
 *   - 全新键（既有记忆无此键）→ 无冲突，不属于差异检测范围；
 *   - 比较前做归一化（trim + 折叠连续空白 + 转小写），保证判定稳定。
 * TODO(infra): 基于语义图谱（semantic-graph）嵌入比对 + 双时态时间戳判定 'stale'。
 */

import type { ConsistencyIssue } from '@shared/memory-framework';

/** 语义冲突类型。 */
export type SemanticConflictKind = 'contradiction' | 'stale' | 'superseded';

/** 语义差异条目。 */
export interface SemanticDiff {
  readonly kind: SemanticConflictKind;
  /** 既有事实。 */
  readonly existing: string;
  /** 新进入事实。 */
  readonly incoming: string;
  /** 关联的跨层一致性问题（复用记忆框架类型，供自愈中心修复）。 */
  readonly issue?: ConsistencyIssue;
}

/** 解析后的事实（键 = subject|attribute，值 = value）。 */
interface ParsedFact {
  readonly key: string;
  readonly value: string;
}

/** 语义差异检测器。 */
export class SemanticDiffDetector {
  /** 比对既有事实与新事实，产出差异条目（顺序与 incoming 一致，确定性输出）。 */
  diff(existingFacts: readonly string[], incomingFacts: readonly string[]): readonly SemanticDiff[] {
    // 索引既有事实：归一化键 → [(原始事实, 归一化值)]
    const index = new Map<string, { fact: string; value: string }[]>();
    for (const fact of existingFacts) {
      const p = parseFact(fact);
      const bucket = index.get(p.key) ?? [];
      bucket.push({ fact, value: p.value });
      index.set(p.key, bucket);
    }

    const diffs: SemanticDiff[] = [];
    for (const incoming of incomingFacts) {
      const p = parseFact(incoming);
      const matches = index.get(p.key);
      if (!matches || matches.length === 0) continue; // 全新事实，无冲突

      const first = matches[0]!;
      if (first.value === p.value) continue; // 同键同值，一致

      const isSupersede = first.value.length > 0 && p.value.includes(first.value);
      diffs.push({
        kind: isSupersede ? 'superseded' : 'contradiction',
        existing: first.fact,
        incoming,
        issue: {
          kind: 'conflict',
          layer: 'semantic',
          id: p.key,
          detail: isSupersede
            ? `语义键「${p.key}」出现更完整表述，旧事实被取代：「${first.value}」→「${p.value}」`
            : `语义冲突：键「${p.key}」既有「${first.value}」与新至「${p.value}」矛盾`,
          severity: isSupersede ? 'med' : 'high',
          repairable: true,
        },
      });
      matches.shift(); // 每条既有事实至多被报告一次，保证幂等
    }
    return diffs;
  }
}

/** 解析事实文本：`subject|attribute|value`；无分隔符时整句为键、值为空。 */
function parseFact(fact: string): ParsedFact {
  const parts = fact.split('|');
  if (parts.length < 3) {
    return { key: normalize(fact), value: '' };
  }
  const value = parts.slice(2).join('|'); // 值本身可含 '|'
  return { key: `${normalize(parts[0]!)}|${normalize(parts[1]!)}`, value: normalize(value) };
}

/** 归一化：trim + 折叠连续空白 + 转小写（保证判定确定性）。 */
function normalize(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}
