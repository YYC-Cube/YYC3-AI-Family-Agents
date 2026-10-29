/**
 * ============================================================
 * YYC³ AI Family — 九层架构分层底座 核心类型定义
 * ------------------------------------------------------------
 * 文档依据：YYC3-AI-Family-Agent-架构设计.md §4（目录树）、
 *           §4.2（两套"九层"编号桥接）。
 *
 * 边界：这里只放"能力底座"（层级能力的抽象契约与编排入口）；
 *       具体家人业务实现位于 `family-agents/`。
 *       底座**不 import 任何家人实现**（不同 root），只暴露通用契约。
 * ============================================================
 */

/** 能力分层 ID（L1–L9，家人档案语义；对齐 §4.2 桥接表）。 */
export type CapabilityLayerId = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'L8' | 'L9';

/** 层级类别：底座 / 业务执行 / 核心决策 / 核心保障。 */
export type LayerKind = 'foundation' | 'business' | 'decision' | 'guard';

/** 层级描述符（describe() 返回值，供注册表与全局态势图消费）。 */
export interface LayerDescriptor {
  /** 层级 ID。 */
  readonly id: CapabilityLayerId;
  /** 层级主题（如「基础底座」「千里·伯乐」）。 */
  readonly theme: string;
  /** 承载家人（基础底座等无家人层级缺省）。 */
  readonly member?: string;
  /** 能力定位（如「推荐能力底座」）。 */
  readonly capability: string;
  readonly kind: LayerKind;
}

/** 层级健康状态。 */
export interface LayerHealth {
  readonly status: 'ok' | 'degraded' | 'down';
  readonly detail?: string;
}

/** 层级健康探针（M29 · 注入式端口）：同步/异步返回健康态；抛错判 down。 */
export type LayerProbe = () => LayerHealth | Promise<LayerHealth>;

/**
 * 层级能力通用契约。
 * 每个层级底座实现此接口：暴露唯一 id、自描述、健康探针。
 */
export interface LayerCapability {
  /** 层级 ID。 */
  readonly id: CapabilityLayerId;
  /** 自描述：返回本层描述符。 */
  describe(): LayerDescriptor;
  /** 健康探针：供全局态势图采集（对接 global-status-center）。 */
  health(): Promise<LayerHealth>;
}

/** §4.2 层级静态清单（能力分层 L → 主题 / 承载家人 / 类别）。 */
export const LAYER_DESCRIPTORS: Readonly<
  Record<CapabilityLayerId, Omit<LayerDescriptor, 'id'>>
> = {
  // 第 1 层：基础底座——公共基础设施，无承载家人
  L1: { theme: '基础底座', capability: '公共基础设施', kind: 'foundation' },
  // 第 2 层：千里·伯乐——推荐能力底座（业务执行层）
  L2: { theme: '千里·伯乐', member: '千里·伯乐', capability: '推荐能力底座', kind: 'business' },
  // 第 3 层：预见·先知——预测能力底座（业务执行层）
  L3: { theme: '预见·先知', member: '预见·先知', capability: '预测能力底座', kind: 'business' },
  // 第 4 层：语枢·万物——分析能力底座（业务执行层）
  L4: { theme: '语枢·万物', member: '语枢·万物', capability: '分析能力底座', kind: 'business' },
  // 第 5 层：言启·千行——入口网关能力底座（业务执行层）
  L5: { theme: '言启·千行', member: '言启·千行', capability: '入口网关能力底座', kind: 'business' },
  // 第 6 层：创想·灵韵——创意能力底座（核心保障层）
  L6: { theme: '创想·灵韵', member: '创想·灵韵', capability: '创意能力底座', kind: 'guard' },
  // 第 7 层：格物·宗师——质量能力底座（核心保障层）
  L7: { theme: '格物·宗师', member: '格物·宗师', capability: '质量能力底座', kind: 'guard' },
  // 第 8 层：智云·守护——安全能力底座（核心保障层）
  L8: { theme: '智云·守护', member: '智云·守护', capability: '安全能力底座', kind: 'guard' },
  // 第 9 层：元启·天枢——全局调度能力底座（核心决策层）
  L9: { theme: '元启·天枢', member: '元启·天枢', capability: '全局调度能力底座', kind: 'decision' },
};
