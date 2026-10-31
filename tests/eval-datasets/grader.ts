/**
 * golden 判分器（grader）—— E1b · 家族自测 SOP（演进集 v1.2.0 解冻第一波）。
 *
 * 纪律：**判分器先自测**（tests/contracts/golden-grader.contract.ts）——未过自测不得启用。
 * 三类断言：
 *   structured / consumer：JSON 可解析（围栏剥离 + 首对象/数组抽取，extractStepJson 同语义）
 *     + parse 类型 + minItems + requiredKeys + contains 子串 + maxChars（消费画像短输出）；
 *   business-zh（keywords）：关键词命中比 ≥ minHitRatio；antiKeywords 任一命中即 fail；
 *     **数值等价通道**（判分器比模型窄的容错）：关键词不足但 assert.numbers 全中 → 仍 pass
 *     ——防止判分器因自身断言面窄误杀数值正确的答案（10-14 评测三坑之三的对策）。
 * 边界：纯函数零依赖；判分理由必须可读（pass/fail 均带 detail）。
 */

/** 断言形态（structured / consumer 卷）。 */
export interface StructuredAssert {
  readonly parse?: 'object' | 'array';
  readonly minItems?: number;
  readonly requiredKeys?: readonly string[];
  readonly contains?: readonly (string | number)[];
  readonly maxChars?: number;
}

/** 断言形态（business-zh 卷）。 */
export interface KeywordAssert {
  readonly keywords?: readonly string[];
  readonly antiKeywords?: readonly string[];
  readonly minHitRatio?: number;
  /** 数值等价通道：全中即等价通过（窄判分容错）。 */
  readonly numbers?: readonly (string | number)[];
}

/** 判分结果（理由必读）。 */
export interface GradeResult {
  readonly pass: boolean;
  readonly detail: string;
}

/** 剥离围栏并抽取首个 JSON 对象/数组；无法解析返回 undefined。 */
export function extractJson(text: string): unknown {
  const stripped = String(text).replace(/```(?:json)?/gi, '').trim();
  for (const pair of [
    ['{', '}'],
    ['[', ']'],
  ] as const) {
    const start = stripped.indexOf(pair[0]);
    const end = stripped.lastIndexOf(pair[1]);
    if (start >= 0 && end > start) {
      try {
        const parsed: unknown = JSON.parse(stripped.slice(start, end + 1));
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {
        /* 尝试下一种括号 */
      }
    }
  }
  return undefined;
}

/** structured / consumer 卷判分。 */
export function gradeStructured(answer: string, assert: StructuredAssert): GradeResult {
  const raw = String(answer ?? '');
  if (assert.maxChars !== undefined && raw.length > assert.maxChars) {
    return { pass: false, detail: `输出 ${raw.length} 字符 > 上限 ${assert.maxChars}（消费画像短输出违约）` };
  }
  const parsed = extractJson(raw);
  if (parsed === undefined) return { pass: false, detail: '输出不可解析为 JSON' };
  if (assert.parse === 'array') {
    if (!Array.isArray(parsed)) return { pass: false, detail: '期望数组，实际非数组' };
    if (assert.minItems !== undefined && parsed.length < assert.minItems) {
      return { pass: false, detail: `数组 ${parsed.length} 项 < 最少 ${assert.minItems}` };
    }
  } else if (assert.parse === 'object' && Array.isArray(parsed)) {
    return { pass: false, detail: '期望对象，实际数组' };
  }
  if (assert.requiredKeys) {
    const obj = (Array.isArray(parsed) ? parsed[0] : parsed) as Record<string, unknown> | undefined;
    for (const key of assert.requiredKeys) {
      if (!obj || !(key in obj)) return { pass: false, detail: `缺必需键 ${key}` };
    }
  }
  for (const token of assert.contains ?? []) {
    if (!raw.includes(String(token))) return { pass: false, detail: `未包含期望值 ${token}` };
  }
  return { pass: true, detail: 'JSON 可解析且断言全过' };
}

/** business-zh 卷判分（关键词 + 反关键词 + 数值等价容错通道）。 */
export function gradeKeywords(answer: string, assert: KeywordAssert): GradeResult {
  const raw = String(answer ?? '');
  for (const bad of assert.antiKeywords ?? []) {
    if (raw.includes(bad)) return { pass: false, detail: `命中反关键词 ${bad}` };
  }
  const keywords = assert.keywords ?? [];
  const hits = keywords.filter((k) => raw.includes(k));
  const ratio = keywords.length === 0 ? 1 : hits.length / keywords.length;
  const threshold = assert.minHitRatio ?? 0.5;
  if (ratio < threshold) {
    // 数值等价通道：判分器关键词面窄时，数值断言全中仍视为通过（不误杀数值正确答案）
    const numbers = assert.numbers ?? [];
    if (numbers.length > 0 && numbers.every((n) => raw.includes(String(n)))) {
      return { pass: true, detail: `关键词比 ${hits.length}/${keywords.length} 不足，但数值断言全中（等价通过）` };
    }
    return { pass: false, detail: `关键词命中 ${hits.length}/${keywords.length}（${ratio.toFixed(2)} < ${threshold}）` };
  }
  return { pass: true, detail: `关键词命中 ${hits.length}/${keywords.length}` };
}

/** 统一入口：按卷分派。 */
export function grade(volume: string, answer: string, testCase: { assert?: unknown }): GradeResult {
  if (volume === 'business-zh') return gradeKeywords(answer, (testCase.assert ?? {}) as KeywordAssert);
  return gradeStructured(answer, (testCase.assert ?? {}) as StructuredAssert);
}
