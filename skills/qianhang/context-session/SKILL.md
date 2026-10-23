---
name: 上下文会话管理
description: 多轮会话状态维护与跨家人上下文传递
version: 1.0.0
id: qianhang.context-session
scope: dedicated
owner: qianhang
---

# 上下文会话管理（`qianhang.context-session`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `qianhang.context-session` |
| 归属（owner） | qianhang |
| scope | dedicated |
| 版本 | 1.0.0 |
| 支柱 | — |
| 标签 | `context` `session` |
| 实现锚点（kernel） | `family-agents/business-layer/member-qianhang/core/context-manager.service.ts` |

## 示例

- 第二轮“再按部门拆一下”继承首轮的分析对象
