---
name: MCP 工具调用
description: 通过 MCP 适配器（codec + 本地 stdio）调用外部工具与数据源
version: 1.0.0
id: shared.mcp-tool
scope: shared
owner: shared
---

# MCP 工具调用（`shared.mcp-tool`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `shared.mcp-tool` |
| 归属（owner） | shared |
| scope | shared |
| 版本 | 1.0.0 |
| 支柱 | 愈 |
| 标签 | `mcp` `tool` |
| 实现锚点（kernel） | `architecture-kernel/02-云枢核心引擎/mcp-adapter/bus-mcp-codec.ts` |

## 示例

- 通过 MCP 调用文件系统工具读取报表
