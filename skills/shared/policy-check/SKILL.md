---
name: 策略校验
description: 按作用域匹配策略并给出 allow/deny 裁决
version: 1.0.0
id: shared.policy-check
scope: shared
owner: shared
---

# 策略校验（`shared.policy-check`）

> 本文件由 [`family-manifest.yaml`](../../presets/family-manifest.yaml) 生成，**勿手改**；
> 以 `pnpm skills:check` 做零漂移校验（范式与 Agent Card 同构）。

| 属性 | 值 |
| ---- | -- |
| 技能 id | `shared.policy-check` |
| 归属（owner） | shared |
| scope | shared |
| 版本 | 1.0.0 |
| 支柱 | 治 |
| 标签 | `policy` `abac` |
| 实现锚点（kernel） | `architecture-kernel/06-治理中心/policy-registry/policy-registry.ts` |

## 步骤（steps）

1. 解析请求的主体/资源/动作
2. 按作用域匹配注册策略（首个命中生效）
3. 输出 allow/deny 裁决与理由

## I/O 契约

| 方向 | 字段 |
| ---- | ---- |
| 输入 | `request` |
| 输出 | `decision` |

## 示例

- 判定“调用外部工具”是否被允许
