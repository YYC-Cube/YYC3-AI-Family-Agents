---
name: 模型调用与降级链
description: 统一 provider 调用接口，按 openai→zhipu→ollama 顺序降级
version: 1.0.0
id: shared.llm-invoke
scope: shared
owner: shared
---

# 模型调用与降级链（`shared.llm-invoke`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `shared.llm-invoke` |
| 归属（owner） | shared |
| scope | shared |
| 版本 | 1.0.0 |
| 支柱 | 愈 |
| 标签 | `llm` `provider` `fallback` |
| 实现锚点（kernel） | `family-agents/shared-core/llm-adapter/index.ts` |

## 示例

- openai 超时后切换 zhipu，再失败切本地 ollama
