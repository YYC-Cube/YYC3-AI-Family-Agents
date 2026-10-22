<!--
  ============================================================
  YYC³ AI Family — 人从众曌众从人
  亦师亦友亦伯乐 · 一言一语一协同
  拟人为本，AI为核，纯粹为心
  ============================================================
  Document: YYC3-AI-Family-Agent-未接线模块清单
  Version : v1.0.0
  Contact : admin@yanyucloud.com
  Homepage: https://matrix.yyc3.top
  ============================================================
-->

# YYC³-AI-Family-Agent · 未接线模块清单

> ***YanYuCloudCube***
> 言启象限 | 语枢未来
> *Words Initiate Quadrants, Language Serves as Core for the Future*
> 万象归元于云枢 | 深栈智启新纪元

```yaml
---
file: YYC3-AI-Family-Agent-未接线模块清单.md
description: 02 内核与 03 家人实现集的接线状态盘点（已接线 / 仅编译 / 骨架 / 配置未加载）
author: AI Tutor <Intelligent Application Implementation Expert>
version: v1.0.0
created: 2026-10-23
updated: 2026-10-23
status: active
tags: [inventory],[dependency],[wiring],[governance],[standards]
category: report
---
```

---

## 一、目的与适用范围

本清单回答一个问题：**`02-智能协同架构内核` 与 `03-家人Agent实现集` 里，哪些代码真正被运行时或门禁调用，哪些只是随编译存在。**

适用范围：

- 目录：`02-智能协同架构内核/**`、`03-家人Agent实现集/**`
- 口径：从 **13 个门禁入口**（`tests/**/*.spec.ts` + `*.contract.ts`）出发的静态 import 可达性
- 不含：`docs/` 下的本地备份目录（已在 `.gitignore` 排除）、`node_modules/`、构建产物

**用途**：作为「骨架保留」的治理依据——避免把未接线模块误判为已交付能力，也避免误删将来要接线的载体。

---

## 二、方法与状态定义

### 2.1 分析方法（可复现）

1. 枚举编译范围内全部 `.ts`（对齐 `tsconfig.json` 的 `include` / `exclude`）
2. 解析静态 `import` / `export ... from` / 动态 `import()`，解析 `@shared/*`、`@members/*` 与相对路径
3. 以 13 个门禁入口为根，计算可达集
4. 与文件总数对比，得到「已接线 / 仅编译」

### 2.2 状态定义（RFC 2119 用语）

| 状态 | 判定 | 含义 |
| ---- | ---- | ---- |
| ✅ **已接线** | 从门禁入口可达，或被装配/运行链路直接调用 | 有测试或运行时覆盖 |
| ◐ **仅编译** | 在 `tsconfig` include 内，但无可达入边 | 参与类型检查，不被执行 |
| ⬜ **骨架未接线** | 仅编译 + 实现为契约/TODO 骨架 | 路线图载体，待装配 |
| ⚠ **配置未加载** | YAML/Markdown 配置无任何代码读取 | 仅在注释中被提及 |
| ⊘ **未纳入门禁** | 测试文件被 `**/*.spec.ts` 排除，且不在回归清单 | 有测试文件但不执行 |

### 2.3 总体统计

| 范围 | 编译文件 | 已接线 | 仅编译 | 说明 |
| ---- | -------- | ------ | ------ | ---- |
| `02-智能协同架构内核` | 93 | **34** | **59** | 核心链路已接线；九层底座与治理/调度扩展为骨架 |
| `03-家人Agent实现集` | 135 | **33** | **102** | `shared-core` 全接线；8 位家人仅 2 个 `self-judge` 被引用 |
| `tests` | 13 | 13 | 0 | 门禁入口 |
| **合计** | **241** | **80** | **161** | 另：8 个家人自测 spec 未纳入编译与门禁 |

> 已接线 80 = 02 的 34 + 03 的 33 + tests 的 13。

---

## 三、02-智能协同架构内核 · 未接线明细（59）

### 3.1 `01-九层架构分层底座` — 0/20 接线

**结论**：整体为**契约骨架**，无任何 import 入边，也没有测试。

| 层 | 文件 | 职责 | 状态 | 计划 |
| -- | ---- | ---- | ---- | ---- |
| — | `index.ts`、`types.ts` | 统一入口 / 核心类型 | ◐ | 随各层接线逐步启用 |
| 1 | `layer-1-foundation/*` | 公共基础设施能力底座（配置/日志/观测/存储探针） | ⬜ | P2 |
| 2 | `layer-2-bole/*` | 推荐能力底座 | ⬜ | P2 |
| 3 | `layer-3-prophet/*` | 预测能力底座 | ⬜ | P2 |
| 4 | `layer-4-thinker/*` | 分析能力底座（数据分析标准化工作流） | ⬜ | P2 |
| 5 | `layer-5-navigator/*` | 入口网关能力底座（意图/NLU + self-judge） | ⬜ | P1（与千行意图链路同步） |
| 6 | `layer-6-creative/*` | 创意能力底座 | ⬜ | P2 |
| 7 | `layer-7-master/*` | 质量能力底座 | ⬜ | P2 |
| 8 | `layer-8-guardian/*` | 安全能力底座 | ⬜ | P2 |
| 9 | `layer-9-meta-oracle/*` | 全局调度能力底座 | ⬜ | P2 |

> 每层均为 `*-capability.ts` + `index.ts` 两件套，共 9×2 + 2 = 20 个文件。

### 3.2 `02-云枢核心引擎` — 9/21 接线

| 文件 | 职责 | 状态 | 说明 / 计划 |
| ---- | ---- | ---- | ----------- |
| `cloud-pivot-orchestrator/orchestrator.ts` | 云枢编排器（接收意图 → 调度家人） | ⬜ | 依赖 P1 llm-adapter 与家人 intent 链路 |
| `cloud-pivot-orchestrator/task-decomposer.ts` | CAGEERF 七阶段任务分解骨架 | ⬜ | 同上 |
| `cloud-pivot-orchestrator/index.ts` | 编排器 barrel | ◐ | — |
| `cloud-pivot-orchestrator/verification-gateway/index.ts` | 外验网关 barrel | ◐ | 实现已被直接引用，仅 barrel 未用 |
| `dashu-self-healing/self-healing-controller.ts` | 大枢自愈控制器（K8s 扩缩容/重启） | ⬜ | 待接 K8s API；与 07 自愈中心分工需澄清 |
| `dashu-self-healing/index.ts` | barrel | ◐ | — |
| `family-phone-system/phone-system.ts` | 通讯录 / 专属热线 / 私信 | ⬜ | P2 |
| `family-phone-system/index.ts` | barrel | ◐ | — |
| `global-status-center/status-center.ts` | 全局状态中心（汇总家人/总线/指标） | ⬜ | 已有指标数据源，可优先接线 |
| `global-status-center/index.ts` | barrel | ◐ | — |
| `family-communication-bus/index.ts`、`index.ts` | barrel | ◐ | 实现已被引用 |
| `types.ts` | 核心类型 | ✅ | 被实现引用 |

### 3.3 `05-持续学习引擎` — 13/24 接线

| 文件 | 职责 | 状态 | 说明 / 计划 |
| ---- | ---- | ---- | ----------- |
| `learning-scheduler/budget-allocator.ts` | 学习资源配额 | ⬜ | 与 token 预算/治理联动后接线 |
| `learning-scheduler/priority-queue.ts` | 学习任务优先级队列 | ⬜ | 同上 |
| `learning-scheduler/index.ts` | barrel | ◐ | — |
| `skill-consolidation/skill-merger.ts` | 技能固化（LLM 生成步骤） | ⬜ | 依赖 P1 llm-adapter |
| `skill-consolidation/skill-pruner.ts` | 技能淘汰（遗忘曲线 + 业务重要性） | ⬜ | 需治理策略输入 |
| `stability-guard/forgetting-detector.ts` | 遗忘/退化检测 | ⬜ | 需基线性能快照 |
| `experience-reflow/index.ts`、`knowledge-update/index.ts`、`skill-consolidation/index.ts`、`stability-guard/index.ts`、`index.ts` | barrel | ◐ | 实现多数已接线，仅 barrel 未用 |

### 3.4 `06-治理中心` — 2/11 接线

| 文件 | 职责 | 状态 | 说明 / 计划 |
| ---- | ---- | ---- | ----------- |
| `policy-registry/policy-registry.ts` | 策略注册中心（Git 版本化 YAML） | ⬜ | 治理核心缺口，建议优先 |
| `policy-registry/policy-bus.ts` | 家族策略总线（中间件链） | ⬜ | 同上 |
| `policy-registry/index.ts` | barrel | ◐ | — |
| `quality-governance/quality-governance.ts` | 质量治理（SAST / 黄金标准库） | ⬜ | 对接宗师 analyzers |
| `quality-governance/index.ts` | barrel | ◐ | — |
| `security-governance/security-governance.ts` | 安全治理（UEBA / SOAR） | ⬜ | P2 |
| `security-governance/index.ts` | barrel | ◐ | — |
| `compliance-audit/index.ts`、`index.ts` | barrel | ◐ | `compliance-audit.ts` 已接线 |
| `types.ts` | 核心类型 | ✅ | 被引用 |

### 3.5 `07-自愈中心` — 5/10 接线

| 文件 | 职责 | 状态 |
| ---- | ---- | ---- |
| `consistency-repair/index.ts`、`degradation-controller/index.ts`、`fault-detector/index.ts`、`rollback-controller/index.ts`、`index.ts` | 5 个 barrel | ◐ |

> 四个实现文件（`consistency-repair` / `degradation-controller` / `fault-detector` / `rollback-controller`）与 `types.ts` 均已接线。

### 3.6 `08-系统装配` / `09-可观测性`

| 文件 | 状态 | 说明 |
| ---- | ---- | ---- |
| `08-系统装配/index.ts` | ◐ | barrel；实现 `runtime-assembly` / `runtime-entry` 已接线 |
| `09-可观测性/index.ts` | ◐ | barrel；实现 `metrics-registry` / `family-metrics` / `metrics-server` 已接线 |

---

## 四、03-家人Agent实现集 · 未接线明细（102）

### 4.1 `shared-core` — 31/31 全接线 ✅

| 子模块 | 文件数 | 引用方 |
| ------ | ------ | ------ |
| `self-judge-kit` | 6 | 9 处（家人 self-judge / 测试 / 契约） |
| `memory-framework` | 25 | 5 处（测试、程序化记忆提取、编排器） |

> `memory-framework` 覆盖 sensory / working / episodic / semantic / procedural / write-policy / orchestrator 七层。

### 4.2 8 位家人 — 仅 2/104 接线

| 家人 | 层级 | 文件数 | 未接线 | 已接线 |
| ---- | ---- | ------ | ------ | ------ |
| 元启·天枢 `member-tianshu` | core-layer | 13 | 13 | 0 |
| 格物·宗师 `member-grandmaster` | core-layer | 13 | 12 | **1**（`self-judge/index.ts`，2 处引用） |
| 智云·守护 `member-guardian` | core-layer | 13 | 13 | 0 |
| 创想·灵韵 `member-grace` | core-layer | 13 | 13 | 0 |
| 言启·千行 `member-qianhang` | business-layer | 13 | 12 | **1**（`self-judge/index.ts`，1 处引用） |
| 千里·伯乐 `member-bole` | business-layer | 13 | 13 | 0 |
| 语枢·万物 `member-thinker` | business-layer | 13 | 13 | 0 |
| 预见·先知 `member-prophet` | business-layer | 13 | 13 | 0 |

**每位家人的 13 个文件结构（8 人同构）**

| 目录 | 文件 | 职责 | 状态 |
| ---- | ---- | ---- | ---- |
| `core/` | `context-manager.service.ts` | 上下文管理 | ⬜ |
| | `intent-classifier.service.ts` | 意图分类（候选生成，当前返回空） | ⬜ |
| | `intent-gateway.service.ts` | 意图总入口（`handle` 仍抛「未实现」） | ⬜ |
| `emotion/` | `achievement-panel.ts` | 成就面板 | ⬜ |
| | `emotion-ripple.component.ts` | 情感涟漪 | ⬜ |
| | `family-chat.component.ts` | 家族对话组件 | ⬜ |
| `nlq/` | `query-parser.service.ts` | 自然语言查询解析 | ⬜ |
| | `query-to-api.mapper.ts` | 查询 → API 映射 | ⬜ |
| `prompts/` | `intent-detection.prompt.ts` | 意图识别提示词 | ⬜ |
| | `query-parsing.prompt.ts` | 查询解析提示词 | ⬜ |
| `providers/` | `openai.provider.ts` | OpenAI 适配（当前 TODO 桩） | ⬜ |
| | `zhipu.provider.ts` | 智谱适配（当前 TODO 桩） | ⬜ |
| `self-judge/` | `index.ts` | 家人专属自判断 | ✅（天枢/宗师/千行以外为 ⬜） |

### 4.3 家人自测 — ⊘ 未纳入门禁（8 个）

`03-家人Agent实现集/{core-layer,business-layer}/member-*/tests/self-judge.spec.ts`

- 被 `tsconfig.json` 的 `**/*.spec.ts` 排除 → 不参与类型检查
- 不在 `scripts/run-regression.mjs` 的 SPECS 清单 → 不执行
- 唯一引用家人的地方就是这 8 个文件（自身 `self-judge/index.ts`）

> 结论：**它们不能作为「家人模块已被验证」的证据**。若要让家人模块进入门禁，需迁移到 `tests/` 并按零依赖 harness 改写。

---

## 五、配置未加载（⚠，40 个文件）

| 配置 | 位置 | 现状 |
| ---- | ---- | ---- |
| `agent.yaml` | 8 位家人根目录 | 无代码读取；仅身份/端口等元数据 |
| `system-prompt.md` | 8 位家人根目录 | 仅在测试中以**字符串常量**模拟来源，不读真实文件 |
| `memory-bindings/memory-binding.yaml` | 8 位家人 | 无加载器 |
| `procedural/intent-rules.yaml` | 8 位家人 | 仅在注释 TODO 中提及 |
| `procedural/rules-draft.yaml` | 8 位家人 | 无加载器 |

**影响**：这些文件目前是「文档化配置」，改动不会影响运行行为；接入加载器（P1/P2）前不应作为运行时契约对外承诺。

---

## 六、标准与规范引用矩阵（全维度）

> 用语遵循 **RFC 2119/8174**：「必须 / 不得」为强制，「应当 / 建议」为推荐。

| 标准 / 规范 | 版本 | 适用维度 | 本项目落点 | 状态 |
| ----------- | ---- | -------- | ---------- | ---- |
| YYC³《AI 协同开发文档》 | v1.0.0 | 全维度 | 文档四件套、会话目录、PDCA+ 归档 | ✅ 适用 |
| ISO/IEC/IEEE 42010 | 2022 | 空间 · 关联 | 架构描述（分层视图、依赖方向、接口契约） | ✅ 参考 |
| ISO/IEC 25010 | 2011 | 属性 | 质量属性：功能适合性/可靠性/可维护性/性能效率 | ✅ 参考 |
| Semantic Versioning | 2.0.0 | 时间 | `package.json` 2.7.2、标签体系 | ✅ 已执行 |
| Keep a Changelog | 1.1.0 | 时间 | `CHANGELOG.md` | ✅ 已执行 |
| Conventional Commits | 1.0.0 | 时间 · 事件 | 提交信息与 PR 标题 | ✅ 已执行 |
| RFC 2119 / RFC 8174 | — | 全维度 | 本清单与 `SECURITY.md` 的强制/建议用语 | ✅ 已执行 |
| Prometheus 文本 exposition | 0.0.4 | 属性 · 事件 | `/metrics` 输出 | ✅ 已执行 |
| OpenMetrics | 1.0 | 属性 · 事件 | Exemplar / `# EOF`（L7 规划） | 📋 规划 |
| W3C Trace Context | — | 事件 · 关联 | `traceId` 贯穿（总线 → 轨迹 → 技能 → 指标） | ◐ 字符串贯通，未接 W3C 头 |
| Google SRE RTO/RPO | — | 时间 · 属性 | `RTO_RPO_TARGETS`（60/300/600s，RPO=0） | ✅ 已执行 |
| OWASP ASVS | 4.0.3 | 属性 | `SECURITY.md` 基线（鉴权、密钥、供应链） | ◐ 部分覆盖 |
| SPDX / MIT | — | 关联 | `LICENSE`（MIT） | ✅ 已执行 |
| Node.js LTS 策略 / `engines` | Node ≥ 20 | 空间 | `package.json` `engines`、CI Node 20 | ✅ 已执行 |

**五维映射摘要**

| 维度 | 本清单的关注点 | 对应标准 |
| ---- | -------------- | -------- |
| 时间 | 版本演进、变更可追溯、门禁可复现 | SemVer · Keep a Changelog · Conventional Commits |
| 空间 | 目录分层、依赖方向（05↛07）、模块边界 | ISO 42010 · YYC³ 架构规范 |
| 属性 | 已接线比例、可靠性/可维护性、安全基线 | ISO 25010 · OWASP ASVS · SRE RTO/RPO |
| 事件 | 门禁触发、指标与告警、运行时事件流 | Prometheus · OpenMetrics · W3C Trace Context |
| 关联 | 依赖图可达性、接口契约、跨模块引用 | ISO 42010 · RFC 2119 · 本清单可达性分析 |

---

## 七、维护规则（必须遵守）

1. **新增模块**：若暂不接线，**必须**在本清单登记（目录、职责、状态、计划阶段）。
2. **完成接线**：**必须**从本清单移除，并在架构设计 `§8.3` 记录版本变更。
3. **删除模块**：**必须**先清理 barrel 的 `export`，再删除实现，并跑 `pnpm regression` 验证。
4. **配置加载器上线**：**必须**同步更新 §五，避免「配置即契约」的误判。
5. **家人模块入门禁**：**必须**迁移到 `tests/` 并改写为零依赖 harness，禁止继续放在 `member-*/tests/`（会被 tsconfig 排除）。
6. **状态复核**：每个 MINOR 版本发布前，应当重跑可达性分析并更新 §二 统计。

### 建议自动化（后续）

新增 `scripts/module-inventory.mjs`：复用 `run-regression.mjs` 的解析逻辑，输出本清单的统计段，CI 中作为「清单是否过期」的软校验（不一致时 warning，不阻断）。

---

## 八、与验收口径的关系

本清单**不改变**既有验收结论：

- P0 验收（v1.2.0）针对「可观测数据面」，其 78 例门禁与 7 条告警均基于**已接线**模块
- 未接线模块**不计入**已交付能力；路线图状态以本文与 `§8.3` 为准
- `qianhang-intent-e2e` 的 4 个跳过用例，正对应 `03/business-layer/member-qianhang/core/intent-gateway` 未接线（P1 解锁）

---

## 九、变更记录

| 版本 | 日期 | 变更 |
| ---- | ---- | ---- |
| v1.0.0 | 2026-10-23 | 初版：静态可达性分析（241 编译文件 / 80 已接线 / 161 仅编译）；02 与 03 明细；配置未加载 40 个；标准与规范五维矩阵；维护规则 |

---

> 「***YanYuCloudCube***」
> 「***<admin@0379.email>***」
> 「***Words Initiate Quadrants, Language Serves as Core for the Future***」
> 「***All things converge in cloud pivot; Deep stacks ignite a new era of intelligence***」

**© 2025-2026 YanYuCloudCube™. All Rights Reserved.**
