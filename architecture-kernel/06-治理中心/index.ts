/**
 * ============================================================
 * YYC³ AI Family — 治理中心（「治」支柱）统一入口（barrel）。
 * ------------------------------------------------------------
 * 四大子模块：
 *   policy-registry     策略即代码注册中心 + 策略总线（统一拦截点）
 *   security-governance 安全治理适配层（对接智云·守护 UEBA/SOAR）
 *   quality-governance  质量治理适配层（对接格物·宗师 SAST/黄金标准库）
 *   compliance-audit    合规与不可篡改审计链
 *
 * 核心机制（§5.4）：策略即代码、白名单可版本化、审计不可篡改（对接守护/宗师）。
 * ============================================================
 */

export * from './types.js';
export * from './policy-registry/index.js';
export * from './security-governance/index.js';
export * from './quality-governance/index.js';
export * from './compliance-audit/index.js';
