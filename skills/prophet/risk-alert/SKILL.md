---
name: 风险预警
description: 异常模式识别与提前预警，附触发阈值
version: 1.0.0
id: prophet.risk-alert
scope: dedicated
owner: prophet
---

# 风险预警（`prophet.risk-alert`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `prophet.risk-alert` |
| 归属（owner） | prophet |
| scope | dedicated |
| 版本 | 1.0.0 |
| 支柱 | — |
| 标签 | `risk` `alert` |
| 实现锚点（kernel） | （纯描述，暂无锚点） |

## 步骤（steps）

1. 监测风险指标阈值
2. 识别异常模式
3. 触发分级预警

## 示例

- 现金流连续两月下滑时触发橙色预警
