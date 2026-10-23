---
name: 安全事件响应
description: 威胁等级判定、隔离与上报闭环
version: 1.0.0
id: guardian.incident-response
scope: dedicated
owner: guardian
---

# 安全事件响应（`guardian.incident-response`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `guardian.incident-response` |
| 归属（owner） | guardian |
| scope | dedicated |
| 版本 | 1.0.0 |
| 支柱 | — |
| 标签 | `incident` `response` |
| 实现锚点（kernel） | （纯描述，暂无锚点） |

## 步骤（steps）

1. 判定威胁等级
2. 隔离受影响会话
3. 上报并闭环处置

## 示例

- 识别提示词注入后隔离会话并上报元启·天枢
