---
name: 记忆检索
description: 按语义与上下文检索情景/语义/程序记忆
version: 1.0.0
id: shared.memory-retrieve
scope: shared
owner: shared
---

# 记忆检索（`shared.memory-retrieve`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `shared.memory-retrieve` |
| 归属（owner） | shared |
| scope | shared |
| 版本 | 1.0.0 |
| 支柱 | 知 |
| 标签 | `memory` `retrieval` |
| 实现锚点（kernel） | `family-agents/shared-core/memory-framework/index.ts` |

## 示例

- 检索同一客户近三次决策的上下文
