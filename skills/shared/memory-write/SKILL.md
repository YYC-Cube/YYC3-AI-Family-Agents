---
name: 记忆写入
description: 按写入策略落盘情景记忆与程序记忆条目
version: 1.0.0
id: shared.memory-write
scope: shared
owner: shared
---

# 记忆写入（`shared.memory-write`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `shared.memory-write` |
| 归属（owner） | shared |
| scope | shared |
| 版本 | 1.0.0 |
| 支柱 | 知 |
| 标签 | `memory` `write` `procedural` |
| 实现锚点（kernel） | `family-agents/shared-core/memory-framework/write-policy` |

## 步骤（steps）

1. 接收待写入条目与显著性信号
2. 按写入策略判定情景/程序记忆归属
3. 落盘并返回写入结果

## I/O 契约

| 方向 | 字段 |
| ---- | ---- |
| 输入 | `entry` `salience` |
| 输出 | `written` |

## 示例

- 把本轮结论写入情景记忆并标注显著性
