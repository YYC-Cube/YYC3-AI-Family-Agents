/**
 * 协同度生产端接线（collaboration-instrumentation）—— P1-T4b（v2.15.0 增量）。
 * 职责：把 P1-T4 注册的 4 项人机协同度指标（family_collaboration_*）接到四个生产链路：
 *   clarification → 千行澄清：IntentGatewayService.handle 每请求记账；
 *                   命中 = intent 为 unknown 或置信度 < τ_low（对齐 qianhang.clarify-ambiguity 规则）
 *   human-confirm → self-judge escalation：EscalationPolicy.decide 每次决策记账；
 *                   命中 = escalation === 'human-confirm'（安全护栏强制人工终审）
 *   trace         → 审计链：ComplianceAudit.append 每条决策记账；
 *                   命中 = traceId 非空（决策可追溯至审计链）
 *   replay        → 学习回流：OutcomeLabeler.label 命中（已回流标注，分子）；
 *                   分母（决策周期入库）由装配层在桥接受理侧记账（recordReplay(1,0)，
 *                   见 runtime-assembly），两端汇合同一 Gauge。
 * 边界：零侵入（Proxy 装饰器，范式同 instrumentMemoryOrchestrator，原对象引用语义不变）；
 *       结构化最小接口——内核层不反向依赖 family-agents，τ_low 本地声明
 *       （对齐 self-judge-kit DEFAULT_JUDGMENT_CONFIG.tauLow = 0.6）。
 */

import type { FamilyMetrics } from './family-metrics.js';

/** 低置信阈值（对齐 self-judge-kit 默认配置；内核不反向依赖 family-agents 故本地声明）。 */
const DEFAULT_TAU_LOW = 0.6;

/** 千行意图网关最小结构（结果含 intent / confidence 字段即可）。 */
interface IntentGatewayLike {
  handle(...args: unknown[]): Promise<unknown>;
}

/** 升级策略最小结构（决策含 escalation 字段即可）。 */
interface EscalationPolicyLike {
  decide(...args: unknown[]): unknown;
}

/** 合规审计链最小结构（首参含 traceId 字段即可）。 */
interface ComplianceAuditLike {
  append(...args: unknown[]): unknown;
}

/** 结果标注器最小结构（回流臂命中记账）。 */
interface OutcomeLabelerLike {
  label(...args: unknown[]): unknown;
}

/**
 * 千行澄清接线（clarification）：包装 handle，每次请求记 total，
 * intent === 'unknown' 或置信度 < τ_low 记 hit（澄清提问回呈用户）。
 */
export function instrumentIntentGateway<T extends IntentGatewayLike>(
  inner: T,
  metrics: FamilyMetrics,
  options: { tauLow?: number } = {},
): T {
  const tauLow = options.tauLow ?? DEFAULT_TAU_LOW;
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === 'handle' && typeof value === 'function') {
        return async (...args: unknown[]) => {
          const result = await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          const r = result as { intent?: unknown; confidence?: unknown } | undefined;
          const needsClarify =
            r?.intent === 'unknown' ||
            (typeof r?.confidence === 'number' && r.confidence < tauLow);
          metrics.recordCollaboration('clarification', needsClarify);
          return result;
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/**
 * self-judge 升级接线（human-confirm）：包装 decide，每次决策记 total，
 * escalation === 'human-confirm'（高严重度偏离 / 极低置信）记 hit。
 */
export function instrumentEscalationPolicy<T extends EscalationPolicyLike>(
  inner: T,
  metrics: FamilyMetrics,
): T {
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === 'decide' && typeof value === 'function') {
        return (...args: unknown[]) => {
          const result = (value as (...a: unknown[]) => unknown).apply(target, args);
          const decision = result as { escalation?: unknown } | undefined;
          metrics.recordCollaboration('human-confirm', decision?.escalation === 'human-confirm');
          return result;
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/**
 * 审计链接线（trace）：包装 append，每条决策记 total，
 * 请求 traceId 非空（可追溯至审计链）记 hit；链式哈希逻辑零改动（方法 this 仍指原对象）。
 */
export function instrumentComplianceAudit<T extends ComplianceAuditLike>(
  inner: T,
  metrics: FamilyMetrics,
): T {
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === 'append' && typeof value === 'function') {
        return (...args: unknown[]) => {
          const result = (value as (...a: unknown[]) => unknown).apply(target, args);
          const req = args[0] as { traceId?: unknown } | undefined;
          metrics.recordCollaboration(
            'trace',
            typeof req?.traceId === 'string' && req.traceId.length > 0,
          );
          return result;
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/**
 * 学习回流接线（replay · 分子）：包装 label，每次回流标注成功记 hit
 * （配合 recordReplay(0, 1)）；分母由装配层在桥接受理侧 recordReplay(1, 0) 记账。
 */
export function instrumentOutcomeLabeler<T extends OutcomeLabelerLike>(
  inner: T,
  metrics: FamilyMetrics,
): T {
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === 'label' && typeof value === 'function') {
        return (...args: unknown[]) => {
          const result = (value as (...a: unknown[]) => unknown).apply(target, args);
          metrics.recordReplay(0, 1);
          return result;
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
