---
name: 自然语言查询转 API
description: 把管理者的自然语言转译为结构化查询参数
version: 1.0.0
id: qianhang.nlq-to-api
scope: dedicated
owner: qianhang
---

# 自然语言查询转 API（`qianhang.nlq-to-api`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `qianhang.nlq-to-api` |
| 归属（owner） | qianhang |
| scope | dedicated |
| 版本 | 1.0.0 |
| 支柱 | — |
| 标签 | `nlq` `mapping` |
| 实现锚点（kernel） | `family-agents/business-layer/member-qianhang/nlq/query-to-api.mapper.ts` |

## 步骤（steps）

1. 解析自然语言查询要素
2. 映射为结构化查询参数
3. 校验后输出 region/month/metric 三元组

## I/O 契约

| 方向 | 字段 |
| ---- | ---- |
| 输入 | `query` |
| 输出 | `querySpec` |

## 示例

- “上月华东区退货率”转成 region/month/metric 三元组
