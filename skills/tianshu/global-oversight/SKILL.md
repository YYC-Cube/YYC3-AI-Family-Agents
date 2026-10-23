---
name: 全局状态巡视
description: 全局状态中心巡视、告警收敛与升级上报
version: 1.0.0
id: tianshu.global-oversight
scope: dedicated
owner: tianshu
---

# 全局状态巡视（`tianshu.global-oversight`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `tianshu.global-oversight` |
| 归属（owner） | tianshu |
| scope | dedicated |
| 版本 | 1.0.0 |
| 支柱 | — |
| 标签 | `status` `alerting` |
| 实现锚点（kernel） | `architecture-kernel/02-云枢核心引擎/global-status-center` |

## 示例

- 汇总五支柱健康度并向人类高管上报异常
