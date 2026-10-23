/**
 * 能力包装载器（P4-T2 · plugin-loader）—— 仅「注册」不「执行」。
 *
 * 边界（演进指导 §4.3 红线）：
 *   - 不做动态 import()、不做远程安装、不引 vm 沙箱；
 *   - 无 IO：清单由部署侧解析后注入（register / registerAll）；
 *   - fail-fast：格式非法（id / version / scope / contents.type）即抛，绝不静默收编；
 *   - 确定性：list 按 id 升序返回。
 */

import { PLUGIN_CONTENT_TYPES, type PluginContentType, type PluginManifest } from './catalog.js';

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const SCOPES: readonly string[] = ['builtin', 'local'];
const REF_RE = /^[a-z0-9][a-z0-9./_-]*$/;

/** 返回清单的全部格式错误（空数组 = 合法）。 */
export function pluginManifestErrors(manifest: PluginManifest): string[] {
  const errors: string[] = [];
  if (!manifest.id) errors.push('缺 id');
  else if (!ID_RE.test(manifest.id)) errors.push(`id 命名不合规：${manifest.id}`);
  if (!VERSION_RE.test(manifest.version ?? '')) errors.push(`缺语义化 version：${manifest.version}`);
  if (!SCOPES.includes(manifest.scope)) errors.push(`scope 非法：${String(manifest.scope)}`);
  const contents = manifest.contents ?? [];
  for (const group of contents) {
    if (!PLUGIN_CONTENT_TYPES.includes(group.type as PluginContentType)) {
      errors.push(`contents.type 非法：${String(group.type)}`);
    }
    for (const ref of group.refs ?? []) {
      if (!REF_RE.test(ref)) errors.push(`引用格式不合规：${ref}`);
    }
  }
  return errors;
}

/** 能力归属（loader 视角的展开项）。 */
export interface LoaderCapability {
  type: PluginContentType;
  ref: string;
  pluginId: string;
}

/**
 * 能力包注册表：register → query，仅此而已。
 * 「装载」语义止步于内存注册——执行由既有运行时（mcp-server / SkillRegistry）承接。
 */
export class PluginLoader {
  private readonly byId = new Map<string, PluginManifest>();

  /** 注册单个能力包；重复 id 或格式非法即抛。 */
  register(manifest: PluginManifest): void {
    const errors = pluginManifestErrors(manifest);
    if (errors.length > 0) {
      throw new Error(`能力包清单非法（${manifest.id ?? '<no-id>'}）：${errors.join('；')}`);
    }
    if (this.byId.has(manifest.id)) {
      throw new Error(`能力包重复注册：${manifest.id}（跨 scope 覆盖请走 catalog 合并，见 buildCapabilityCatalog）`);
    }
    this.byId.set(manifest.id, manifest);
  }

  /** 批量注册（数组序，重复 id 即抛）。 */
  registerAll(manifests: readonly PluginManifest[]): void {
    for (const m of manifests) this.register(m);
  }

  /** 生效清单（id 升序，确定性）。 */
  list(): readonly PluginManifest[] {
    return [...this.byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /** 按 id 查询。 */
  get(id: string): PluginManifest | undefined {
    return this.byId.get(id);
  }

  /** 已注册能力包数量。 */
  get size(): number {
    return this.byId.size;
  }

  /** 展开全部注册能力（type → ref → pluginId 稳定排序）。 */
  capabilities(): readonly LoaderCapability[] {
    const out: LoaderCapability[] = [];
    for (const m of this.list()) {
      for (const group of m.contents ?? []) {
        for (const ref of group.refs) {
          out.push({ type: group.type, ref, pluginId: m.id });
        }
      }
    }
    out.sort((a, b) =>
      a.type === b.type ? (a.ref === b.ref ? (a.pluginId < b.pluginId ? -1 : 1) : a.ref < b.ref ? -1 : 1) : a.type < b.type ? -1 : 1,
    );
    return out;
  }

  /** 按类型过滤注册能力。 */
  capabilitiesOf(type: PluginContentType): readonly LoaderCapability[] {
    return this.capabilities().filter((c) => c.type === type);
  }
}
