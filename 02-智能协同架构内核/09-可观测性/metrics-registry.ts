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

/** Histogram（累积分桶 + 总和 + 计数）。 */
export class Histogram {
  private readonly buckets: readonly number[];
  private readonly values = new Map<
    string,
    { labels: LabelSet; counts: number[]; sum: number; count: number }
  >();

  constructor(
    readonly descriptor: MetricDescriptor,
    buckets: readonly number[] = DEFAULT_BUCKETS,
  ) {
    // 上界去重升序，保证累积语义正确
    this.buckets = [...new Set(buckets)].sort((a, b) => a - b);
  }

  /** 观测一个值（秒）。 */
  observe(value: number, labels: LabelSet = {}): void {
    if (!Number.isFinite(value)) return;
    const key = labelKey(labels);
    let s = this.values.get(key);
    if (!s) {
      s = { labels, counts: new Array(this.buckets.length).fill(0), sum: 0, count: 0 };
      this.values.set(key, s);
    }
    s.sum += value;
    s.count += 1;
    for (let i = 0; i < this.buckets.length; i += 1) {
      if (value <= this.buckets[i]!) s.counts[i]! += 1;
    }
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

  histogram(name: string, help: string, buckets?: readonly number[]): Histogram {
    const metric = new Histogram({ name, help, type: 'histogram' }, buckets);
    this.metrics.push(metric);
    return metric;
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
}
