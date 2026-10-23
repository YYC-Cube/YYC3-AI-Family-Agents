---
name: 故障降级与自愈
description: 故障侦测去抖、熔断降级、一致性修复与版本回滚
version: 1.0.0
id: shared.fault-heal
scope: shared
owner: shared
---

# 故障降级与自愈（`shared.fault-heal`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `shared.fault-heal` |
| 归属（owner） | shared |
| scope | shared |
| 版本 | 1.0.0 |
| 支柱 | 愈 |
| 标签 | `fault` `circuit` `rollback` |
| 实现锚点（kernel） | `architecture-kernel/07-自愈中心/fault-detector` |

## 示例

- 失败率升高后熔断并回滚技能版本
