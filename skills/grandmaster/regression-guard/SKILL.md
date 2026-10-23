---
name: 回归与退化检测
description: 变更前后的基线对比与退化拦截
version: 1.0.0
id: grandmaster.regression-guard
scope: dedicated
owner: grandmaster
---

# 回归与退化检测（`grandmaster.regression-guard`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `grandmaster.regression-guard` |
| 归属（owner） | grandmaster |
| scope | dedicated |
| 版本 | 1.0.0 |
| 支柱 | — |
| 标签 | `regression` `baseline` |
| 实现锚点（kernel） | `architecture-kernel/05-持续学习引擎/stability-guard/regression-tester.ts` |

## 示例

- 新版本意图准确率下降 2% 时拦截发布
