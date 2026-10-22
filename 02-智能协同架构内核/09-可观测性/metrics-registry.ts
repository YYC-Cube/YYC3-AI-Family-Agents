/**
 * 轻量指标注册器（metrics-registry）——「09-可观测性」基础设施（v2.7.0，P0 数据面）。
 * 职责：以**零运行时依赖**实现 Prometheus 三大基础指标（Counter / Gauge / Histogram），
 *       并按 Prometheus 文本 exposition 格式渲染（# HELP / # TYPE / 样本行）。
 * 边界：只做指标存储与渲染；指标语义与埋点归 family-metrics，HTTP 暴露归 metrics-server。
 *
 * 设计约束（对齐仓库零依赖原则）：
 *   - 不引入 prom-client；哈希/标签/分桶全部内置；
 *   - 渲染确定性：指标按注册顺序、同类标签按 key 字典序输出，便于 diff 与快照测试；
 *   - Histogram 输出 `_bucket{le=...}` / `_sum` / `_count`，直接兼容 histogram_quantile()。
 */

/** 指标类型（Prometheus 文本协议）。 */
export type MetricType = 'counter' | 'gauge' | 'histogram';

/** 标签集合（键值均为字符串）。 */
export type LabelSet = Readonly<Record<string, string>>;

/** Exemplar 配置（v2.8.0 / L7）。默认关闭，关闭时不改变任何输出。 */
export interface ExemplarOptions {
  /** 是否启用 exemplar（默认 false）。 */
  readonly enabled?: boolean;
  /** 每个桶最多保留的 exemplar 数（默认 1，超出保留最新）。 */
  readonly maxPerBucket?: number;
  /** exemplar 存活毫秒（默认 60s，渲染时惰性清理）。 */
  readonly ttlMs?: number;
  /** 丢弃回调（内部用于累加 `family_exemplars_dropped_total`）。 */
  readonly onDrop?: () => void;
}

/** 单条 exemplar（OpenMetrics：样本值 + 关联标签 + 时间戳）。 */
export interface Exemplar {
  /** 触发该 exemplar 的观测值。 */
  readonly value: number;
  /** 观测时刻（毫秒）。 */
  readonly timestampMs: number;
  /** 关联标签，约定只放 `trace_id` 等低基数、非敏感键。 */
  readonly labels?: LabelSet;
}

/** 指标元信息。 */
export interface MetricDescriptor {
  readonly name: string;
  readonly help: string;
  readonly type: MetricType;
}

/** 默认直方图分桶（秒级：任务时长 / 检索耗时通用）。 */
export const DEFAULT_BUCKETS: readonly number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/** 数值渲染（NaN / ±Inf 用 Prometheus 合法字面量）。 */
function formatNumber(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Number.POSITIVE_INFINITY) return '+Inf';
  if (value === Number.NEGATIVE_INFINITY) return '-Inf';
  return String(value);
}

/** 标签转义（\\ → \\\\，换行 → \\n，引号 → \\"）。 */
function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

/** 标签序列化为确定性键（按 key 字典序）。 */
function labelKey(labels: LabelSet): string {
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}="${escapeLabel(labels[k]!)}"`)
    .join(',');
}

/** 渲染 `{...}` 后缀（无标签返回空串）。 */
function renderLabelSuffix(key: string): string {
  return key ? `{${key}}` : '';
}

/** 标签集合的取值序列（用于按标签聚合）。 */
interface Series {
  readonly labels: LabelSet;
  readonly key: string;
}

/** Counter（单调递增）。 */
export class Counter {
  private readonly values = new Map<string, { labels: LabelSet; value: number }>();

  constructor(readonly descriptor: MetricDescriptor) { }

  /** 递增（默认 +1）。 */
  inc(labels: LabelSet = {}, value = 1): void {
    const key = labelKey(labels);
    const cur = this.values.get(key);
    if (cur) cur.value += value;
    else this.values.set(key, { labels, value });
  }

  /** 当前值。 */
  value(labels: LabelSet = {}): number {
    return this.values.get(labelKey(labels))?.value ?? 0;
  }

  /** 渲染样本行（不含 HELP/TYPE）。 */
  render(): string[] {
    return [...this.values.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, s]) => `${this.descriptor.name}${renderLabelSuffix(key)} ${formatNumber(s.value)}`);
  }

  /** 全部序列（供聚合/调试）。 */
  series(): readonly Series[] {
    return [...this.values.values()].map((s) => ({ labels: s.labels, key: labelKey(s.labels) }));
  }
}

/** Gauge（可增可减可设）。 */
export class Gauge {
  private readonly values = new Map<string, { labels: LabelSet; value: number }>();

  constructor(readonly descriptor: MetricDescriptor) { }

  set(value: number, labels: LabelSet = {}): void {
    this.values.set(labelKey(labels), { labels, value });
  }

  inc(labels: LabelSet = {}, value = 1): void {
    const key = labelKey(labels);
    const cur = this.values.get(key);
    if (cur) cur.value += value;
    else this.values.set(key, { labels, value });
  }

  dec(labels: LabelSet = {}, value = 1): void {
    this.inc(labels, -value);
  }

  value(labels: LabelSet = {}): number {
    return this.values.get(labelKey(labels))?.value ?? 0;
  }

  render(): string[] {
    return [...this.values.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, s]) => `${this.descriptor.name}${renderLabelSuffix(key)} ${formatNumber(s.value)}`);
  }
}

/** 单个直方图序列的存储。 */
interface HistogramSeries {
  readonly labels: LabelSet;
  readonly counts: number[];
  sum: number;
  count: number;
  /** 桶索引 → exemplar 列表（索引 = buckets.length 表示 +Inf 桶）。 */
  readonly exemplars: Map<number, { ex: Exemplar; at: number }[]>;
}

/** Histogram（累积分桶 + 总和 + 计数 + 可选 exemplar）。 */
export class Histogram {
  private readonly buckets: readonly number[];
  private readonly values = new Map<string, HistogramSeries>();
  private readonly exemplarEnabled: boolean;
  private readonly maxPerBucket: number;
  private readonly ttlMs: number;
  private readonly onDrop?: () => void;

  constructor(
    readonly descriptor: MetricDescriptor,
    buckets: readonly number[] = DEFAULT_BUCKETS,
    exemplars: ExemplarOptions = {},
  ) {
    // 上界去重升序，保证累积语义正确
    this.buckets = [...new Set(buckets)].sort((a, b) => a - b);
    this.exemplarEnabled = exemplars.enabled === true;
    this.maxPerBucket = Math.max(1, exemplars.maxPerBucket ?? 1);
    this.ttlMs = Math.max(0, exemplars.ttlMs ?? 60_000);
    this.onDrop = exemplars.onDrop;
  }

  /** exemplar 是否启用（供协议协商与测试）。 */
  get exemplarsEnabled(): boolean {
    return this.exemplarEnabled;
  }

  /**
   * 观测一个值（秒）。
   * 第三参仅在 exemplar 启用时生效；未启用时完全忽略，保证默认输出不变。
   */
  observe(value: number, labels: LabelSet = {}, exemplar?: Exemplar): void {
    if (!Number.isFinite(value)) return;
    const key = labelKey(labels);
    let s = this.values.get(key);
    if (!s) {
      s = { labels, counts: new Array(this.buckets.length).fill(0), sum: 0, count: 0, exemplars: new Map() };
      this.values.set(key, s);
    }
    s.sum += value;
    s.count += 1;
    for (let i = 0; i < this.buckets.length; i += 1) {
      if (value <= this.buckets[i]!) s.counts[i]! += 1;
    }

    if (!this.exemplarEnabled || !exemplar) return;
    const idx = this.bucketIndex(value);
    const now = Date.now();
    const items = s.exemplars.get(idx) ?? [];
    // 惰性清理过期项
    const alive = items.filter((it) => now - it.at <= this.ttlMs);
    alive.push({ ex: exemplar, at: now });
    // 超出上限：保留最新，丢弃最旧并计数
    while (alive.length > this.maxPerBucket) {
      alive.shift();
      this.onDrop?.();
    }
    s.exemplars.set(idx, alive);
  }

  /** 观测总数。 */
  count(labels: LabelSet = {}): number {
    return this.values.get(labelKey(labels))?.count ?? 0;
  }

  /** 观测总和。 */
  sum(labels: LabelSet = {}): number {
    return this.values.get(labelKey(labels))?.sum ?? 0;
  }

  /** 渲染样本行（累积分桶 + +Inf + _sum + _count）。 */
  render(): string[] {
    const out: string[] = [];
    for (const [key, s] of [...this.values.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const prefix = s.labels;
      for (let i = 0; i < this.buckets.length; i += 1) {
        const labels = { ...prefix, le: formatNumber(this.buckets[i]!) };
        out.push(`${this.descriptor.name}_bucket${renderLabelSuffix(labelKey(labels))} ${formatNumber(s.counts[i]!)}`);
      }
      out.push(
        `${this.descriptor.name}_bucket${renderLabelSuffix(labelKey({ ...prefix, le: '+Inf' }))} ${formatNumber(s.count)}`,
      );
      out.push(`${this.descriptor.name}_sum${renderLabelSuffix(key)} ${formatNumber(s.sum)}`);
      out.push(`${this.descriptor.name}_count${renderLabelSuffix(key)} ${formatNumber(s.count)}`);
    }
    return out;
  }

  /**
   * 渲染 OpenMetrics 样本行：在落点桶后附 exemplar。
   * 格式：`<bucket> <count> # {trace_id="..."} <value> <ts秒>`
   */
  renderOpenMetrics(): string[] {
    const out: string[] = [];
    for (const [key, s] of [...this.values.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const prefix = s.labels;
      for (let i = 0; i < this.buckets.length; i += 1) {
        const labels = { ...prefix, le: formatNumber(this.buckets[i]!) };
        out.push(
          `${this.descriptor.name}_bucket${renderLabelSuffix(labelKey(labels))} ${formatNumber(s.counts[i]!)}${this.exemplarSuffix(i, s)}`,
        );
      }
      const infLabels = { ...prefix, le: '+Inf' };
      out.push(
        `${this.descriptor.name}_bucket${renderLabelSuffix(labelKey(infLabels))} ${formatNumber(s.count)}${this.exemplarSuffix(this.buckets.length, s)}`,
      );
      out.push(`${this.descriptor.name}_sum${renderLabelSuffix(key)} ${formatNumber(s.sum)}`);
      out.push(`${this.descriptor.name}_count${renderLabelSuffix(key)} ${formatNumber(s.count)}`);
    }
    return out;
  }

  /** 值 → 落点桶索引（超出最大上界归入 +Inf 桶）。 */
  private bucketIndex(value: number): number {
    for (let i = 0; i < this.buckets.length; i += 1) {
      if (value <= this.buckets[i]!) return i;
    }
    return this.buckets.length;
  }

  /** 单个桶的 exemplar 后缀（取最新存活项；过期项在此惰性清理）。 */
  private exemplarSuffix(idx: number, s: HistogramSeries): string {
    const items = s.exemplars.get(idx);
    if (!items || items.length === 0) return '';
    const now = Date.now();
    const alive = items.filter((it) => now - it.at <= this.ttlMs);
    if (alive.length === 0) {
      s.exemplars.delete(idx);
      return '';
    }
    const last = alive[alive.length - 1]!;
    const labels = labelKey(last.ex.labels ?? {});
    return ` # {${labels}} ${formatNumber(last.ex.value)} ${(last.ex.timestampMs / 1000).toFixed(3)}`;
  }
}

/** 指标注册器：持有全部指标并渲染完整 exposition 文本。 */
export class MetricsRegistry {
  private readonly metrics: (Counter | Gauge | Histogram)[] = [];

  counter(name: string, help: string): Counter {
    const metric = new Counter({ name, help, type: 'counter' });
    this.metrics.push(metric);
    return metric;
  }

  gauge(name: string, help: string): Gauge {
    const metric = new Gauge({ name, help, type: 'gauge' });
    this.metrics.push(metric);
    return metric;
  }

  histogram(
    name: string,
    help: string,
    buckets?: readonly number[],
    exemplars?: ExemplarOptions,
  ): Histogram {
    const metric = new Histogram({ name, help, type: 'histogram' }, buckets, exemplars);
    this.metrics.push(metric);
    return metric;
  }

  /** 是否存在启用 exemplar 的直方图（供协议协商）。 */
  get exemplarsEnabled(): boolean {
    return this.metrics.some((m) => m instanceof Histogram && m.exemplarsEnabled);
  }

  /** 渲染 Prometheus 文本 exposition（末尾带换行，符合 exposition 规范）。 */
  render(): string {
    const lines: string[] = [];
    for (const metric of this.metrics) {
      const { name, help, type } = metric.descriptor;
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${type}`);
      lines.push(...metric.render());
    }
    return `${lines.join('\n')}\n`;
  }

  /**
   * 渲染 OpenMetrics 1.0（末尾以 `# EOF` 结束）。
   * 直方图在落点桶后附 exemplar；Counter/Gauge 输出与 0.0.4 一致。
   */
  renderOpenMetrics(): string {
    const lines: string[] = [];
    for (const metric of this.metrics) {
      const { name, help, type } = metric.descriptor;
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${type}`);
      lines.push(...(metric instanceof Histogram ? metric.renderOpenMetrics() : metric.render()));
    }
    lines.push('# EOF');
    return `${lines.join('\n')}\n`;
  }
}
