/**
 * 偏好追踪（preference-tracker）——「学」支柱 knowledge-update 子模块。
 * 职责：用户偏好**渐进更新**（渐进式覆盖，不粗暴替换，保留历史偏好可回溯）。
 * 边界：只维护偏好；规则演化归 rule-evolution。
 *
 * v2.5.0（Phase E）转实——历史保留 + 冲突防抖：
 *   - update() 沿用纯函数签名；实例内部自动把 current 存入该 key 的历史（可回溯）；
 *   - 冲突防抖（渐进式覆盖）：观测值与当前值不同 → 置信先衰减（×0.5，上限 0.5）再累积，
 *     避免偶发反馈翻转高置信偏好；同值反馈 → 置信按 alpha 渐进提升。
 * TODO(infra): 历史写入语义记忆（preference 实体）；持续冲突触发治理裁决。
 */

/** 用户偏好条目。 */
export interface Preference {
  readonly key: string;
  readonly value: unknown;
  /** 置信度 0–1（随反馈渐进提升）。 */
  readonly confidence: number;
  readonly updatedAt: number;
}

/** 偏好追踪器。 */
export class PreferenceTracker {
  private readonly history = new Map<string, Preference[]>();

  /**
   * 渐进更新：以 alpha 为学习率向观测值靠拢。
   * 传入 current 时自动归档历史（historyOf 可回溯）；首见 key 用 'unknown' 兜底。
   */
  update(current: Preference | undefined, observed: unknown, alpha = 0.3): Preference {
    const key = current?.key ?? 'unknown';
    if (current) {
      const hist = this.history.get(key) ?? [];
      hist.push(current);
      this.history.set(key, hist);
    }
    const prevConfidence = current?.confidence ?? 0;
    // 冲突防抖：值变化 → 先衰减再累积；同值 → 直接渐进提升
    const changed = current !== undefined && !scalarEquals(current.value, observed);
    const base = changed ? Math.min(prevConfidence * 0.5, 0.5) : prevConfidence;
    return {
      key,
      value: observed,
      confidence: base + alpha * (1 - base),
      updatedAt: Date.now(),
    };
  }

  /** 指定 key 的历史偏好（旧→新，供回溯与冲突消解审计）。 */
  historyOf(key: string): readonly Preference[] {
    return this.history.get(key) ?? [];
  }

  /** 全部已追踪 key（供观测）。 */
  trackedKeys(): readonly string[] {
    return [...this.history.keys()];
  }
}

/** 值相等判定（标量与可序列化值统一走 JSON 比较，保证确定）。 */
function scalarEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
