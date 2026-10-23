/**
 * 能力包准入治理（P4-T3 · allowlist）—— 默认 observe，enforce 需显式开关。
 *
 * 职责（演进指导 §4.3 · M13 判据）：
 *   - 准入清单（插件 id 白名单）由部署侧注入，内核不做 IO；
 *   - 未准入包被调用时**必定**写入 ComplianceAudit（不可篡改审计链）；
 *   - observe（默认）：放行但留痕，只观察不阻断；
 *   - enforce（显式开关）：拒绝调用并计数（rejectedCount）。
 *
 * 边界：仅做准入判定与审计留痕；执行仍由既有运行时承接
 * （红线：不做动态 import() / 远程安装 / vm 沙箱）。
 */

import { ComplianceAudit } from '../06-治理中心/compliance-audit/compliance-audit.js';
import type { PolicyDecision } from '../06-治理中心/types.js';
import type { PluginManifest } from './catalog.js';

/** 准入模式：observe 只记审计；enforce 拒绝。 */
export const ADMISSION_MODES = ['observe', 'enforce'] as const;
export type AdmissionMode = (typeof ADMISSION_MODES)[number];

/** 默认准入模式——observe（enforce 必须显式声明）。 */
export const DEFAULT_ADMISSION_MODE: AdmissionMode = 'observe';

/** 准入策略标识（写入审计记录的 policyId / policyVersion）。 */
export const ADMISSION_POLICY_ID = 'capability-allowlist';
export const ADMISSION_POLICY_VERSION = '1.0.0';

/** 未声明 action 时的默认动作。 */
export const DEFAULT_ADMISSION_ACTION = 'capability.invoke';

/** 准入治理配置（部署侧注入）。 */
export interface AdmissionConfig {
  /** 准入清单（插件 id）。 */
  readonly allowed: readonly string[];
  /** 准入模式；缺省 observe（enforce 需显式传入）。 */
  readonly mode?: AdmissionMode;
  /** 审计链（缺省自建内存链；可注入共享链）。 */
  readonly audit?: ComplianceAudit;
}

/** 一次能力包调用（准入判定入参）。 */
export interface AdmissionRequest {
  readonly pluginId: string;
  readonly traceId: string;
  readonly actor: string;
  readonly action?: string;
  readonly resource?: string;
}

/** 准入判定结果。 */
export interface AdmissionDecision {
  /** 是否放行本次调用（observe 下未准入仍放行）。 */
  readonly admitted: boolean;
  readonly mode: AdmissionMode;
  readonly pluginId: string;
  readonly reason: string;
  /** 是否写入审计链（仅未准入调用留痕）。 */
  readonly audited: boolean;
}

/**
 * 能力包准入清单：allowlist + observe/enforce 判定。
 * 未准入调用一律写审计；enforce 下额外拒绝并计数。
 */
export class CapabilityAllowlist {
  private readonly allowed: ReadonlySet<string>;
  private readonly mode: AdmissionMode;
  private readonly audit: ComplianceAudit;
  private rejected = 0;
  private observed = 0;

  constructor(config: AdmissionConfig) {
    const mode = config.mode ?? DEFAULT_ADMISSION_MODE;
    if (!ADMISSION_MODES.includes(mode)) {
      throw new Error(`准入模式非法：${String(mode)}（仅 observe / enforce）`);
    }
    this.allowed = new Set(config.allowed);
    this.mode = mode;
    this.audit = config.audit ?? new ComplianceAudit();
  }

  /** 生效准入模式。 */
  get admissionMode(): AdmissionMode {
    return this.mode;
  }

  /** enforce 下被拒绝的调用次数。 */
  get rejectedCount(): number {
    return this.rejected;
  }

  /** observe 下放行但留痕的调用次数。 */
  get observedCount(): number {
    return this.observed;
  }

  /** 审计链快照（只读）。 */
  get auditRecords() {
    return this.audit.list();
  }

  /** 插件是否在准入清单内。 */
  isAllowed(pluginId: string): boolean {
    return this.allowed.has(pluginId);
  }

  /** 审计链完整性校验（篡改即断链）。 */
  verifyAudit(): boolean {
    return this.audit.verify();
  }

  /** 一次能力包调用的准入判定（未准入必定写审计）。 */
  admit(request: AdmissionRequest): AdmissionDecision {
    if (this.isAllowed(request.pluginId)) {
      return {
        admitted: true,
        mode: this.mode,
        pluginId: request.pluginId,
        reason: '已在准入清单',
        audited: false,
      };
    }

    const enforced = this.mode === 'enforce';
    const decision: PolicyDecision = enforced
      ? {
          decision: 'deny',
          policyId: ADMISSION_POLICY_ID,
          policyVersion: ADMISSION_POLICY_VERSION,
          reason: `未准入能力包（enforce 拒绝）：${request.pluginId}`,
          obligations: ['拒绝调用'],
        }
      : {
          decision: 'allow-with-audit',
          policyId: ADMISSION_POLICY_ID,
          policyVersion: ADMISSION_POLICY_VERSION,
          reason: `未准入能力包（observe 放行留痕）：${request.pluginId}`,
          obligations: ['记录审计'],
        };

    this.audit.append(
      {
        traceId: request.traceId,
        actor: request.actor,
        action: request.action ?? DEFAULT_ADMISSION_ACTION,
        resource: request.resource ?? request.pluginId,
      },
      decision,
    );

    if (enforced) {
      this.rejected += 1;
      return {
        admitted: false,
        mode: this.mode,
        pluginId: request.pluginId,
        reason: decision.reason,
        audited: true,
      };
    }

    this.observed += 1;
    return {
      admitted: true,
      mode: this.mode,
      pluginId: request.pluginId,
      reason: decision.reason,
      audited: true,
    };
  }

  /** 按准入清单过滤（未准入不可见——供 tools/list 等可见性场景复用）。 */
  filterAllowed(manifests: readonly PluginManifest[]): readonly PluginManifest[] {
    return manifests.filter((m) => this.isAllowed(m.id));
  }
}
