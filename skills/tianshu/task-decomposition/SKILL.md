---
name: 任务分解与分派
description: 按 CAGEERF 七阶段分解任务并指派 owner 与依赖
version: 1.0.0
id: tianshu.task-decomposition
scope: dedicated
owner: tianshu
---

# 任务分解与分派（`tianshu.task-decomposition`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `tianshu.task-decomposition` |
| 归属（owner） | tianshu |
| scope | dedicated |
| 版本 | 1.0.0 |
| 支柱 | — |
| 标签 | `decomposition` `cageref` `dispatch` |
| 实现锚点（kernel） | `architecture-kernel/02-云枢核心引擎/cloud-pivot-orchestrator/task-decomposer.ts` |

## 步骤（steps）

1. 按 CAGEERF 七阶段拆解任务
2. 指派 owner 与依赖关系
3. 输出可执行子任务清单

## I/O 契约

| 方向 | 字段 |
| ---- | ---- |
| 输入 | `goal` `constraints` |
| 输出 | `subtasks` |

## 示例

- 把“降本 10%”拆成 5 个可执行子任务并派给对应家人
