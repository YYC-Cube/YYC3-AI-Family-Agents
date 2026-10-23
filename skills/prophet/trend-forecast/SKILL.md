---
name: 趋势预测
description: 时间序列趋势外推与区间估计
version: 1.0.0
id: prophet.trend-forecast
scope: dedicated
owner: prophet
---

# 趋势预测（`prophet.trend-forecast`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `prophet.trend-forecast` |
| 归属（owner） | prophet |
| scope | dedicated |
| 版本 | 1.0.0 |
| 支柱 | — |
| 标签 | `forecast` `time-series` |
| 实现锚点（kernel） | （纯描述，暂无锚点） |

## 步骤（steps）

1. 构建时间序列特征
2. 外推趋势并估计区间
3. 输出预测与置信带

## 示例

- 预测未来三个月订单量区间并标注置信带
