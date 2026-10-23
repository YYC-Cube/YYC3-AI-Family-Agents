---
name: 意图检测
description: 六类意图闭集识别，输出意图/置信度/理由
version: 1.0.0
id: qianhang.intent-detection
scope: dedicated
owner: qianhang
---

# 意图检测（`qianhang.intent-detection`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `qianhang.intent-detection` |
| 归属（owner） | qianhang |
| scope | dedicated |
| 版本 | 1.0.0 |
| 支柱 | — |
| 标签 | `intent` `classification` |
| 实现锚点（kernel） | `family-agents/business-layer/member-qianhang/prompts/intent-detection.prompt.ts` |

## 示例

- 识别“这月花了多少”为 analysis 意图并给置信度
