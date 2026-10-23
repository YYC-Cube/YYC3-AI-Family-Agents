/**
 * 能力注册中心（P4-T2 · 静态注册中心）—— scope 解析与合并，纯函数、零网络。
 *
 * 职责（ADR D4「静态清单 + 门禁可验证」）：
 *   - 接收 builtin / local 两组已解析的能力包清单（解析由部署侧完成，内核不做 IO）；
 *   - 确定性合并：同 id local 覆盖 builtin；组内同 id 后者覆盖前者；
 *   - 展开注册能力（contents refs）并保持 (type, ref) 稳定排序；
 *   - 提供只读查询：清单、覆盖关系、能力归属。
 *
 * 红线：不 import family-agents；不做动态 import()；不做远程安装；插件 = 静态清单。
 */

/** 能力包分发域：builtin 随版本分发；local 部署侧覆盖。 */
export type PluginScope = 'builtin' | 'local';

/** contents.type 白名单（P4-T1 格式契约）。 */
export const PLUGIN_CONTENT_TYPES = ['skills', 'mcp-servers', 'policies', 'prompts'] as const;
export type PluginContentType = (typeof PLUGIN_CONTENT_TYPES)[number];

/** 能力包内的一组内容声明。 */
export interface PluginContent {
  type: PluginContentType;
  refs: readonly string[];
}

/** 完整性声明（算法与摘要见 integrity.ts）。 */
export interface PluginIntegrity {
  algorithm: string;
  digest: string;
}

/** 能力包清单（plugin.yaml 解析后的形态）。 */
export interface PluginManifest {
  id: string;
  version: string;
  scope: PluginScope;
  description?: string;
  contents?: readonly PluginContent[];
  integrity?: PluginIntegrity;
  targets?: { agents?: readonly string[] };
}

/** 展开后的注册能力归属。 */
export interface CatalogCapability {
  type: PluginContentType;
  ref: string;
  /** 提供该能力的插件 id。 */
  pluginId: string;
  /** 生效清单的 scope。 */
  scope: PluginScope;
}

/** 注册中心快照（合并与展开的确定性结果）。 */
export interface CapabilityCatalogSnapshot {
  /** 生效清单（按 id 升序）。 */
  plugins: readonly PluginManifest[];
  /** 被 local 覆盖的 builtin id（升序）。 */
  overriddenIds: readonly string[];
  /** 展开的注册能力（按 type 字典序 → ref 字典序 → pluginId 升序）。 */
  capabilities: readonly CatalogCapability[];
}

/** 组内去重：同 id 后者覆盖前者（数组序即优先级）。 */
function latestById(manifests: readonly PluginManifest[]): Map<string, PluginManifest> {
  const map = new Map<string, PluginManifest>();
  for (const m of manifests) map.set(m.id, m);
  return map;
}

const byId = (a: PluginManifest, b: PluginManifest) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * 合并 builtin / local 两组清单并展开能力。
 * 覆盖顺序确定且可测：组内数组序后者胜；跨层 local 必覆盖 builtin。
 */
export function buildCapabilityCatalog(
  builtin: readonly PluginManifest[],
  local: readonly PluginManifest[],
): CapabilityCatalogSnapshot {
  const builtinMap = latestById(builtin);
  const localMap = latestById(local);
  const overriddenIds: string[] = [];
  for (const id of localMap.keys()) if (builtinMap.has(id)) overriddenIds.push(id);

  const effective = new Map<string, PluginManifest>(builtinMap);
  for (const [id, m] of localMap) effective.set(id, m);

  const plugins = [...effective.values()].sort(byId);
  const capabilities: CatalogCapability[] = [];
  for (const m of plugins) {
    for (const group of m.contents ?? []) {
      for (const ref of group.refs) {
        capabilities.push({ type: group.type, ref, pluginId: m.id, scope: m.scope });
      }
    }
  }
  capabilities.sort((a, b) =>
    a.type === b.type
      ? a.ref === b.ref
        ? a.pluginId < b.pluginId
          ? -1
          : a.pluginId > b.pluginId
            ? 1
            : 0
        : a.ref < b.ref
          ? -1
          : 1
      : a.type < b.type
        ? -1
        : 1,
  );
  return { plugins, overriddenIds: overriddenIds.sort(), capabilities };
}

/** 查询生效清单。 */
export function findPlugin(snapshot: CapabilityCatalogSnapshot, id: string): PluginManifest | undefined {
  return snapshot.plugins.find((m) => m.id === id);
}

/** 按类型过滤注册能力。 */
export function capabilitiesOfType(
  snapshot: CapabilityCatalogSnapshot,
  type: PluginContentType,
): readonly CatalogCapability[] {
  return snapshot.capabilities.filter((c) => c.type === type);
}

/** 注册能力是否存在（含归属）。 */
export function hasCapability(
  snapshot: CapabilityCatalogSnapshot,
  type: PluginContentType,
  ref: string,
): boolean {
  return snapshot.capabilities.some((c) => c.type === type && c.ref === ref);
}
