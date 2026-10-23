/**
 * MCP 服务端装配（mcp-server-assembly）—— P6-A（M14）· 能力供给接线闭环。
 * 职责：把「工具目录 + 准入治理 + 指标仪表」组装为一个可启动的 MCP 请求处理器——
 *   tools/call 治理链：可见性 → CapabilityAllowlist 裁决（observe 留痕 / enforce 拒绝）
 *   → Policy 放行后进入 dispatch（instrumentMcpDispatcher 记 ok|error）；
 *   metrics 注入即接线：plugin_denied（enforce 拒绝）与 mcp_tool_calls 自动记账
 *   （技能装载侧 skills_loaded 由部署侧以 instrumentSkillRegistry 包装，见 family-server.entry）。
 * 边界：只做装配与策略适配；协议语义归 02 protocol、准入判定归 10 allowlist、
 *       指标语义归 09；工具目录与清单由部署侧注入（内核不读 assets/presets）。
 */

import {
  createMcpRequestHandler,
  type McpRequestHandler,
  type McpServerInfo,
  type McpToolDescriptor,
  type McpToolPolicy,
  type McpToolDispatcher,
} from '../02-云枢核心引擎/mcp-adapter/server/protocol.js';
import { CapabilityAllowlist, type AdmissionMode } from '../10-能力注册中心/allowlist.js';
import type { ComplianceAudit } from '../06-治理中心/compliance-audit/compliance-audit.js';
import type { FamilyMetrics } from '../09-可观测性/family-metrics.js';
import {
  instrumentCapabilityAllowlist,
  instrumentMcpDispatcher,
} from '../09-可观测性/capability-instrumentation.js';

/** 缺省提供工具目录的能力包（当前 45 工具全部由金包 family-core 提供）。 */
export const DEFAULT_MCP_PLUGIN_ID = 'family-core';

/** 准入配置（直通 CapabilityAllowlist；缺省 observe + 仅 family-core）。 */
export interface McpAdmissionOptions {
  readonly allowed: readonly string[];
  readonly mode?: AdmissionMode;
  readonly audit?: ComplianceAudit;
}

/** 装配选项（全部注入式；本模块零 IO）。 */
export interface McpServerAssemblyOptions {
  readonly serverInfo: McpServerInfo;
  readonly tools: readonly McpToolDescriptor[];
  readonly visible?: (tool: McpToolDescriptor) => boolean;
  readonly admission?: McpAdmissionOptions;
  /** 工具 → 能力包归属（缺省全部归 family-core）。 */
  readonly pluginOfTool?: (toolName: string) => string;
  /** 真实分派（未配置时 tools/call 回 -32603）。 */
  readonly dispatch?: McpToolDispatcher;
  /** 共享指标集：传入即自动接线（准入拒绝 + 分派 ok|error）。 */
  readonly metrics?: FamilyMetrics;
  /** 无 _meta.traceId 时的合成前缀（保证未携带链路的准入审计仍可追溯）。 */
  readonly tracePrefix?: string;
}

/** 装配结果：无状态 MCP 处理器 + 准入清单（供部署侧查询 rejectedCount / 审计链）。 */
export interface McpServerAssembly {
  readonly handler: McpRequestHandler;
  readonly allowlist: CapabilityAllowlist;
}

/**
 * 组装 MCP 服务端（准入裁决 → 仪表化分派 → 无状态 JSON-RPC 处理器）。
 * 未携带 traceId 的调用按 `tracePrefix-序号` 合成，确保 observe 留痕与
 * enforce 拒绝都落入不可篡改审计链。
 */
export function assembleMcpServer(options: McpServerAssemblyOptions): McpServerAssembly {
  const tracePrefix = options.tracePrefix ?? 'mcp-no-trace';
  let untraced = 0;

  const allowlist = new CapabilityAllowlist({
    allowed: options.admission?.allowed ?? [DEFAULT_MCP_PLUGIN_ID],
    mode: options.admission?.mode,
    audit: options.admission?.audit,
  });
  const governed = options.metrics ? instrumentCapabilityAllowlist(allowlist, options.metrics) : allowlist;

  const policy: McpToolPolicy = (ctx) => {
    const decision = governed.admit({
      pluginId: options.pluginOfTool ? options.pluginOfTool(ctx.toolName) : DEFAULT_MCP_PLUGIN_ID,
      traceId: ctx.traceId ?? `${tracePrefix}-${(untraced += 1)}`,
      actor: ctx.actor ?? 'mcp:anonymous',
      action: 'tool.call',
      resource: ctx.toolName,
    });
    return { admitted: decision.admitted, reason: decision.reason };
  };

  const dispatch =
    options.dispatch && options.metrics
      ? instrumentMcpDispatcher(options.dispatch, options.metrics)
      : options.dispatch;

  return {
    handler: createMcpRequestHandler({
      serverInfo: options.serverInfo,
      tools: options.tools,
      visible: options.visible,
      policy,
      dispatch,
    }),
    allowlist,
  };
}
