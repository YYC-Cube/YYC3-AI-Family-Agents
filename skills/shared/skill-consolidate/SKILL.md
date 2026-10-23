---
name: 技能固化与回滚
description: 回归零退化后固化技能版本，退化时回滚到前一版本
version: 1.0.0
id: shared.skill-consolidate
scope: shared
owner: shared
---

# 技能固化与回滚（`shared.skill-consolidate`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `shared.skill-consolidate` |
| 归属（owner） | shared |
| scope | shared |
| 版本 | 1.0.0 |
| 支柱 | 学 · 愈 |
| 标签 | `skill` `versioning` `rollback` |
| 实现锚点（kernel） | `architecture-kernel/05-持续学习引擎/skill-consolidation` |

## 步骤（steps）

1. 接收候选技能与目标版本
2. 跑回归门禁评估零退化
3. 通过则固化版本，退化则回滚

## I/O 契约

| 方向 | 字段 |
| ---- | ---- |
| 输入 | `skillId` `nextVersion` |
| 输出 | `consolidated` `rolledBack` |

## 示例

- 零退化后固化 v1.1.0，退化则回滚 v1.0.0
