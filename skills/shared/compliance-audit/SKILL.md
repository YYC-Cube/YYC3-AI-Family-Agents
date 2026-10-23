---
name: 合规审计
description: 追加可验真的链式审计记录并校验完整性
version: 1.0.0
id: shared.compliance-audit
scope: shared
owner: shared
---

# 合规审计（`shared.compliance-audit`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `shared.compliance-audit` |
| 归属（owner） | shared |
| scope | shared |
| 版本 | 1.0.0 |
| 支柱 | 治 |
| 标签 | `audit` `hash-chain` |
| 实现锚点（kernel） | `architecture-kernel/06-治理中心/compliance-audit/compliance-audit.ts` |

## 示例

- 为一次工具调用追加审计记录并验真
