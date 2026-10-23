---
name: 成就与激励洞察
description: 成就面板数据解读与激励建议
version: 1.0.0
id: bole.achievement-insight
scope: dedicated
owner: bole
---

# 成就与激励洞察（`bole.achievement-insight`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `bole.achievement-insight` |
| 归属（owner） | bole |
| scope | dedicated |
| 版本 | 1.0.0 |
| 支柱 | — |
| 标签 | `achievement` `incentive` |
| 实现锚点（kernel） | `family-agents/business-layer/member-bole/emotion/achievement-panel.ts` |

## 步骤（steps）

1. 读取成就面板数据
2. 解读成就与激励的关联
3. 输出团队激励节奏建议

## I/O 契约

| 方向 | 字段 |
| ---- | ---- |
| 输入 | `panel` |
| 输出 | `insights` |

## 示例

- 依据成就面板给出团队激励节奏建议
