/**
 * 能力供给生产端接线（capability-instrumentation）—— §6.3 指标扩展的接线闭环。
 * 职责：把 §6.3 注册的 3 项能力供给指标（family_capability_*）接到三个生产链路：
 *   skills_loaded → 技能装载：SkillRegistry.loadFromManifest 每次装载逐技能记账
 *                   （planned 条目跳过不记；幂等重载按次数累计——口径是「加载次数」）；
 *   mcp_tool_calls → MCP 工具调用：tools/call 在 Policy 裁决放行后进入 dispatch，
 *                   成功记 ok、抛错记 error（协议层仍按 isError 语义回包，不炸）；
 *   plugin_denied  → 准入拒绝：CapabilityAllowlist enforce 拒绝分支逐次记账
 *                   （observe 放行留痕不计——告警基线 increase() > 0 即红线）。
 * 边界：零侵入（Proxy 装饰器 / 函数包装，范式同 collaboration-instrumentation，
 *       原对象引用语义不变）；结构化最小接口——内核层不反向依赖 family-agents，
 *       亦不绑定 02 协议层的具体形态（部署侧把三者接到各自构造点）。
 */

import type { FamilyMetrics } from './family-metrics.js';

/** 清单技能条目最小结构（id + 可选 status 即可判定装载与跳过）。 */
interface ManifestEntryLike {
  readonly id: string;
  readonly status?: string;
}

/** 技能注册中心最小结构（loadFromManifest 结果含 loaded / skippedPlanned 即可）。 */
interface SkillRegistryLike {
  loadFromManifest(entries: readonly ManifestEntryLike[]): { loaded: number; skippedPlanned: readonly string[] };
}

/** 准入清单最小结构（判定结果含 admitted / pluginId 即可识别 enforce 拒绝）。 */
interface CapabilityAllowlistLike {
  admit(...args: unknown[]): { admitted: boolean; pluginId: string };
}

/** 工具分派器最小结构（tools/call Policy 放行后执行；同步返回或抛错）。 */
type McpDispatchFn = (ctx: never) => unknown;

/**
 * 技能装载接线（skills_loaded）：包装 loadFromManifest，每次装载对非 planned
 * 条目逐技能记账（对齐加载器「planned 跳过」语义；重载累计为加载次数）。
 */
export function instrumentSkillRegistry<T extends SkillRegistryLike>(inner: T, metrics: FamilyMetrics): T {
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === 'loadFromManifest' && typeof value === 'function') {
        return (entries: readonly ManifestEntryLike[]) => {
          const result = (value as (...a: unknown[]) => unknown).apply(target, [entries]);
          for (const entry of entries) {
            if (entry.status !== 'planned') metrics.recordSkillLoaded(entry.id);
          }
          return result;
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/**
 * MCP 工具调用接线（mcp_tool_calls）：包装 dispatch 函数——成功记 ok、抛错记 error
 * 后原样重抛（协议层照常转 isError 工具结果）。仅在 Policy 放行后才会进入 dispatch，
 * 策略拒绝不计入本指标（准入红线由 plugin_denied 承接）。
 */
export function instrumentMcpDispatcher<F extends McpDispatchFn>(dispatch: F, metrics: FamilyMetrics): F {
  const wrapped = ((ctx: never): unknown => {
    try {
      const output = dispatch(ctx);
      metrics.recordMcpToolCall('ok');
      return output;
    } catch (error) {
      metrics.recordMcpToolCall('error');
      throw error;
    }
  }) as F;
  return wrapped;
}

/**
 * 准入拒绝接线（plugin_denied）：包装 admit，enforce 拒绝（admitted=false）逐次
 * 记账；observe 放行（admitted=true，留痕不阻断）不计。
 */
export function instrumentCapabilityAllowlist<T extends CapabilityAllowlistLike>(
  inner: T,
  metrics: FamilyMetrics,
): T {
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === 'admit' && typeof value === 'function') {
        return (...args: unknown[]) => {
          const decision = (value as (...a: unknown[]) => unknown).apply(target, args) as {
            admitted: boolean;
            pluginId: string;
          };
          if (!decision.admitted) metrics.recordPluginDenied(decision.pluginId);
          return decision;
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
