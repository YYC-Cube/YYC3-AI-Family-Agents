/**
 * 统一技能 id 帮助器（skill-id）—— P3-T3。
 * 职责：打通三套技能表示的 id 命名空间——
 *   ① manifest 契约：`{owner-slug}.{skill-slug}`（如 `qianhang.intent-detection`，
 *      正则与 presets/family-manifest.yaml 校验一致）；
 *   ② 运行时注册（procedural-memory SkillRegistry）：直接复用 manifest id；
 *   ③ 学习引擎沉淀（SkillStore）：内部主键保留 FNV `skill-xxxxxxxx`（已落盘数据不动，
 *      演进指导 ADR-D2），新增 `logicalId` 字段映射到统一命名空间；
 *      无显式 logicalId 的历史数据按 `learned.{内部 id}` 归并读取。
 * 边界：纯函数零依赖；内核不反向依赖 family-agents，id 格式即契约。
 */

/** manifest 技能 id 规范（与 scripts/lib/family-manifest.mjs 校验一致）。 */
export const MANIFEST_SKILL_ID_RE = /^[a-z0-9]+\.[a-z0-9-]+$/;

/** 学习沉淀命名空间前缀。 */
export const LEARNED_PREFIX = 'learned';

/** FNV 内部主键形态（learning-loop skillIdOf 产物）。 */
const FNV_SKILL_ID_RE = /^skill-[0-9a-f]{8}$/;

/** 派生 manifest 规范技能 id（不规范即抛错，fail-fast）。 */
export function manifestSkillId(ownerSlug: string, skillSlug: string): string {
  const id = `${ownerSlug}.${skillSlug}`;
  if (!MANIFEST_SKILL_ID_RE.test(id)) throw new Error(`技能 id 不合规（${MANIFEST_SKILL_ID_RE}）：${id}`);
  return id;
}

/** 学习沉淀 id：`learned.` + 规范 id（如 `learned.qianhang.intent-detection`）。 */
export function learnedSkillId(ownerSlug: string, skillSlug: string): string {
  return `${LEARNED_PREFIX}.${manifestSkillId(ownerSlug, skillSlug)}`;
}

/** 是否学习沉淀命名空间。 */
export function isLearnedId(id: string): boolean {
  return id.startsWith(`${LEARNED_PREFIX}.`);
}

/** 学习沉淀 id → 规范 id（非 learned 前缀返回 null）。 */
export function canonicalOfLearned(id: string): string | null {
  if (!isLearnedId(id)) return null;
  return id.slice(LEARNED_PREFIX.length + 1);
}

/** 是否 FNV 内部主键形态。 */
export function isFnvSkillId(id: string): boolean {
  return FNV_SKILL_ID_RE.test(id);
}

/** 历史数据归并规则：无 logicalId 的 FNV 主键按 `learned.{内部 id}` 归并。 */
export function legacyLearnedId(internalId: string): string {
  return `${LEARNED_PREFIX}.${internalId}`;
}

/** 存储/注册技能对外暴露的统一 logicalId（显式声明优先，FNV 遗留归并，其余即自身 id）。 */
export function logicalIdOfStored(skill: { readonly id: string; readonly logicalId?: string }): string {
  if (skill.logicalId) return skill.logicalId;
  if (isFnvSkillId(skill.id)) return legacyLearnedId(skill.id);
  return skill.id;
}
