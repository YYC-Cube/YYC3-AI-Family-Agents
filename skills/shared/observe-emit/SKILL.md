---
name: 指标与追踪埋点
description: 以 traceId 贯穿事件并写入 family_* 指标
version: 1.0.0
id: shared.observe-emit
scope: shared
owner: shared
---

# 指标与追踪埋点（`shared.observe-emit`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `shared.observe-emit` |
| 归属（owner） | shared |
| scope | shared |
| 版本 | 1.0.0 |
| 支柱 | 治 |
| 标签 | `metrics` `tracing` |
| 实现锚点（kernel） | `architecture-kernel/09-可观测性/family-metrics.ts` |

## 步骤（steps）

1. 捕获任务事件与 traceId
2. 写入 family_* 指标序列
3. 输出追踪埋点

## I/O 契约

| 方向 | 字段 |
| ---- | ---- |
| 输入 | `event` `traceId` |
| 输出 | `metric` |

## 示例

- 为任务执行记录 outcome 与耗时并保留 traceId
