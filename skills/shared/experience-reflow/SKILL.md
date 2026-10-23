---
name: 经验回流
description: 轨迹采集、模式提炼与学习周期触发
version: 1.0.0
id: shared.experience-reflow
scope: shared
owner: shared
---

# 经验回流（`shared.experience-reflow`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `shared.experience-reflow` |
| 归属（owner） | shared |
| scope | shared |
| 版本 | 1.0.0 |
| 支柱 | 学 |
| 标签 | `trajectory` `learning` |
| 实现锚点（kernel） | `architecture-kernel/05-持续学习引擎/experience-reflow` |

## 步骤（steps）

1. 采集任务轨迹与自评信号
2. 提炼成功/失败模式三元组
3. 触发学习周期与技能固化

## I/O 契约

| 方向 | 字段 |
| ---- | ---- |
| 输入 | `trajectory` |
| 输出 | `patterns` |

## 示例

- 把一次成功分析沉淀为可复用轨迹
