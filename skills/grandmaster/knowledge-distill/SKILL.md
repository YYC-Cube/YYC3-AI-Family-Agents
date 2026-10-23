---
name: 知识提炼与技能固化
description: 把复盘结论蒸馏为可复用程序记忆条目
version: 1.0.0
id: grandmaster.knowledge-distill
scope: dedicated
owner: grandmaster
---

# 知识提炼与技能固化（`grandmaster.knowledge-distill`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `grandmaster.knowledge-distill` |
| 归属（owner） | grandmaster |
| scope | dedicated |
| 版本 | 1.0.0 |
| 支柱 | — |
| 标签 | `distill` `procedural` |
| 实现锚点（kernel） | `architecture-kernel/05-持续学习引擎/knowledge-update` |

## 步骤（steps）

1. 汇集复盘结论与同类案例
2. 蒸馏为程序记忆条目
3. 固化为可复用处置规则

## I/O 契约

| 方向 | 字段 |
| ---- | ---- |
| 输入 | `retrospectives` |
| 输出 | `procedure` |

## 示例

- 把三次同类故障的处置提炼为一条处置规则
