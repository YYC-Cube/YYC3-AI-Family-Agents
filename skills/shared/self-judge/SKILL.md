---
name: 结构化自判断
description: 产出置信度、登记假设、检测偏离并给出升级决策
version: 1.0.0
id: shared.self-judge
scope: shared
owner: shared
---

# 结构化自判断（`shared.self-judge`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `shared.self-judge` |
| 归属（owner） | shared |
| scope | shared |
| 版本 | 1.0.0 |
| 支柱 | 自 |
| 标签 | `confidence` `assumption` `escalation` |
| 实现锚点（kernel） | `family-agents/shared-core/self-judge-kit/index.ts` |

## 示例

- 对候选意图给出 0..1 置信度并显式登记假设
