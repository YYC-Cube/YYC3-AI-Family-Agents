/**
 * 10-能力注册中心 barrel —— P4-T2 静态注册中心 + P4-T3 准入治理 + P4-T4 完整性校验。
 *
 * 红线：仅依赖 node: 标准库；插件 = 静态可校验清单 + 已编译模块的注册，
 * 不做动态 import() / 远程安装 / vm 沙箱。
 */

export {
  PLUGIN_CONTENT_TYPES,
  buildCapabilityCatalog,
  capabilitiesOfType,
  findPlugin,
  hasCapability,
} from './catalog.js';
export type {
  CapabilityCatalogSnapshot,
  CatalogCapability,
  PluginContent,
  PluginContentType,
  PluginIntegrity,
  PluginManifest,
  PluginScope,
} from './catalog.js';
export { PluginLoader, pluginManifestErrors } from './plugin-loader.js';
export type { LoaderCapability } from './plugin-loader.js';
export {
  PLUGIN_DIGEST_ALGORITHM,
  canonicalDigestLines,
  computePluginDigest,
  sha256Hex,
  verifyPluginDigest,
} from './integrity.js';
export type { PluginDigestEntry } from './integrity.js';
export {
  ADMISSION_MODES,
  ADMISSION_POLICY_ID,
  ADMISSION_POLICY_VERSION,
  CapabilityAllowlist,
  DEFAULT_ADMISSION_ACTION,
  DEFAULT_ADMISSION_MODE,
} from './allowlist.js';
export type { AdmissionConfig, AdmissionDecision, AdmissionMode, AdmissionRequest } from './allowlist.js';
