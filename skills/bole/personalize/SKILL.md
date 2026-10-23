---
name: 个性化推荐
description: 基于画像与行为的对象/内容推荐
version: 1.0.0
id: bole.personalize
scope: dedicated
owner: bole
---

# 个性化推荐（`bole.personalize`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `bole.personalize` |
| 归属（owner） | bole |
| scope | dedicated |
| 版本 | 1.0.0 |
| 支柱 | — |
| 标签 | `recommendation` `personalization` |
| 实现锚点（kernel） | （纯描述，暂无锚点） |

## 步骤（steps）

1. 结合画像与行为特征
2. 对候选对象/内容排序
3. 输出个性化推荐

## 示例

- 为管理者推荐本周最应关注的三个指标
