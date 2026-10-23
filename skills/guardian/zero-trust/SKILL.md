---
name: 零信任鉴权
description: 每次调用均校验身份、权限与来源可信度
version: 1.0.0
id: guardian.zero-trust
scope: dedicated
owner: guardian
---

# 零信任鉴权（`guardian.zero-trust`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `guardian.zero-trust` |
| 归属（owner） | guardian |
| scope | dedicated |
| 版本 | 1.0.0 |
| 支柱 | — |
| 标签 | `zero-trust` `auth` |
| 实现锚点（kernel） | （纯描述，暂无锚点） |

## 示例

- 拒绝未携带有效令牌的外部工具调用
