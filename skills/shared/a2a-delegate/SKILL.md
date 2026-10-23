---
name: A2A 任务委托
description: 发现对端 Agent Card 并委托任务、归一结果
version: 1.0.0
id: shared.a2a-delegate
scope: shared
owner: shared
---

# A2A 任务委托（`shared.a2a-delegate`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `shared.a2a-delegate` |
| 归属（owner） | shared |
| scope | shared |
| 版本 | 1.0.0 |
| 支柱 | 治 |
| 标签 | `a2a` `delegation` |
| 实现锚点（kernel） | `architecture-kernel/a2a-adapter/index.ts` |

## 步骤（steps）

1. 发现对端 well-known Agent Card
2. 按能力定位并委托 JSON-RPC 任务
3. 归一结果，失败入有界死信队列

## I/O 契约

| 方向 | 字段 |
| ---- | ---- |
| 输入 | `capability` `task` |
| 输出 | `taskId` `state` |

## 示例

- 元启·天枢向语枢·万物委托一次数据分析任务
