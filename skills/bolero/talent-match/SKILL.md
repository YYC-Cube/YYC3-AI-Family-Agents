---
name: 人才匹配
description: 岗位画像与人选能力匹配度评分
version: 1.0.0
id: bolero.talent-match
scope: dedicated
owner: bolero
---

# 人才匹配（`bolero.talent-match`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `bolero.talent-match` |
| 归属（owner） | bolero |
| scope | dedicated |
| 版本 | 1.0.0 |
| 支柱 | — |
| 标签 | `talent` `matching` |
| 实现锚点（kernel） | （纯描述，暂无锚点） |

## 步骤（steps）

1. 构建岗位能力画像
2. 匹配人选能力证据
3. 输出匹配度评分

## 示例

- 为新设的区域运营岗匹配三位候选人
