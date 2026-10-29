<!--
  ============================================================
  YYC³ AI Family — 人从众曌众从人
  亦师亦友亦伯乐 · 一言一语一协同
  拟人为本，AI为核，纯粹为心
  ============================================================
  Document: YYC3-AI-Family-Agent-未接线模块清单
  Version : v1.32.0
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
version: v1.32.0
created: 2026-10-23
updated: 2026-10-30
status: active
tags: [inventory],[dependency],[wiring],[governance],[standards]
category: report
---
```

---

## 一、目的与适用范围

本清单回答一个问题：**`architecture-kernel` 与 `family-agents` 里，哪些代码真正被运行时或门禁调用，哪些只是随编译存在。**

适用范围：

- 目录：`architecture-kernel/**`、`family-agents/**`
- 口径：从 **43 个门禁入口**（`tests/**/*.spec.ts` + `*.contract.ts`，UAT 门控 spec 不作入口）出发的静态 import 可达性
- 不含：`docs/` 下的本地备份目录（已在 `.gitignore` 排除）、`node_modules/`、构建产物

**用途**：作为「骨架保留」的治理依据——避免把未接线模块误判为已交付能力，也避免误删将来要接线的载体。

---

## 二、方法与状态定义

### 2.1 分析方法（可复现）

1. 枚举编译范围内全部 `.ts`（对齐 `tsconfig.json` 的 `include` / `exclude`）
2. 解析静态 `import` / `export ... from` / 动态 `import()`，解析 `@shared/*`、`@members/*` 与相对路径
3. 以 43 个门禁入口为根，计算可达集
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
| `architecture-kernel` | 116 | **94** | **22** | 核心链路已接线（含 CAGEERF 分解 + P1-T4b 协同度仪表 + P3-MCP 协议语义 + P3-T3 统一技能 id + P3-T4 索引契约 + P3-T5 评测契约 + P4-T2/T3/T4 能力注册中心与准入治理 + P4-T5 工具目录分派 + P2 a2a-adapter 与安全策略映射 + §6.3 能力供给接线仪表 + M23–M26 学习调度/生命周期/编排四件转实 + P8 收尾装配位（学习落位 / usage 回填）+ M29 九层底座全接线）；**A 类骨架清零** |
| `family-agents` | 150 | **36** | **114** | `shared-core` 记忆 / 学习 / LLM 主链路全接线；家人意图链路 4 文件 + 伯乐成就面板已接线；8 位家人薄转发 provider 与 llm-adapter barrel 属部署侧消费（纯可达口径计仅编译） |
| `tests` | 46 | 46 | 0 | 门禁入口（含 P1 llm-provider / 千行 e2e / P1-T1 清单 / P1-T2 卡片 / P1-T3 MCP / P1-T4 五维 / P1-T4b 协同接线 / P1-T5 提示词契约 / P3-T2 技能产物 / P3-MCP 协议语义 / P3-T3 统一 id / P3-T4 渐进披露 / P3-T5 行为评测 / P3-T6 能力供给契约 / P4-T1 能力包格式 / P4-T2·T4 静态注册中心 / P4-T3 准入治理 / P4-T5 工具目录与分派 / P4-T6 打包分发注册闭环与打包 CLI 契约 / P2-T1 外部 Worker 契约 / P2-T2 A2A 适配层 / P2-T4 安全策略映射 / §6.3 能力供给生产接线 / P6 家族服务装配·执行引擎·语义臂·学习调度·生命周期·家族编排 / P9-a 九层底座 / R1/R2 npm 双包契约） |
| **合计** | **312** | **176** | **136** | 另：8 个家人自测 spec 未纳入编译与门禁；2 个 UAT 门控 spec（`uat:llm` / `uat:external`）在编译范围但不作门禁入口，不纳入本表 |

> 已接线 176 = kernel 94 + agents 36 + tests 46（门禁入口 46，UAT 门控 2 不计入）。v1.20.0 起「已接线」统一为**纯静态可达**口径（可复现 BFS：相对导入 + `@shared` 别名 + barrel 透传，以门禁入口为根）：与 v1.19.0 手工盘点相比，agents 41 → 34 全部来自口径统一（家人薄转发 provider 等部署侧消费文件移入仅编译，**无实际拆线**——family-agents 文件数与内容在 P5 零变更）；kernel 45 → 69 含 P5 新增 5 文件 + P6 新增（mcp-server-assembly / skill-executor）与别名解析补全。**v1.24.0 已完成仅编译文件逐文件归类复核（见 §2.5，v1.25.0 起随接线滚动更新）**；§三 / §四 的逐行 ✅/◐ 明细以 §2.5 归类结论为准（本表为权威口径）。

### 2.5 仅编译文件逐文件归类（v1.24.0 复核 167；v1.25.0 时点 165 = 在册 163 + UAT 2）

以门禁入口为根的 BFS 复核（首版 2026-10-24 · M22 时点 40 入口 167 文件；当前 M23 时点 41 入口 165 文件），全部归入六类，无一遗漏：

| 类 | 数量 | 文件构成 | 处置结论 |
| -- | ---- | -------- | -------- |
| A. 九层底座契约骨架 | 0（**v1.31.0 全接线** ✅） | `01-九层架构分层底座/` 20 文件 + `layer-registry.ts` 新增——探针注入端口 + NineLayerRegistry 注册中心 + reportLayerHealth 态势对接（M29 · A 类清零） | 原判解除 |
| B. 内核再导出 barrel | 22 | 02/05/07/08/09 各模块 `index.ts`（含 mcp-adapter、verification-gateway、scheduler、stability-guard、rollback 等子 barrel） | 深路径消费的再导出聚合，无功能缺失——冷是**消费方式**（消费方 import 深路径）而非未交付；保留 |
| C. 内核功能骨架 | 0（**v1.28.0 清零** ✅） | budget/priority（M23）· merger/pruner/forgetting（M25）· orchestrator/status-center/phone-system/self-healing-controller（M26）九件全部转实接线 | 多数有实现体、待装配接线（§三原「计划」列维持；learning-scheduler 与 stability-guard 为 M 系列候选） |
| D. 家人同构模板衍生 | 108 | 千行 ×10（core 三件已接线）+ 其余 7 家人 ×14（core 3 · emotion 3 · nlq 2 · prompts 2 · providers 2 · self-judge 1 · tests 1） | `create-member` 模板衍生的部署侧消费文件；意图链路语义已由千行套件 + e2e 门禁覆盖同构实现，其余为八家人运行时脚手架——**保留不拆**（拆线即破坏家人目录契约） |
| E. shared-core 部件 | 6 | self-judge-kit 四件（assumption-tracker / confidence-scorer / deviation-detector / index）+ llm-adapter/index + memory-framework/index | escalation-policy 与 types 已接线；三部件功能由内核等价实现覆盖（一致性比率指标消费 ConsistencyTracker）；barrel 同 B 类 |
| F. UAT 门控 spec | 2 | `tests/uat/llm-live-uat.spec.ts` · `tests/uat/external-worker-uat.spec.ts` | 设计上不作门禁入口（三闸门控、hermetic 不破），不计入 §2.3 |

> 复核结论：**无一处「误判已交付」或「应拆未拆」**；v1.25.0：C 类 budget-allocator/priority-queue 桩转实并入门禁（learning-scheduler 子模块整体转已接线），kernel 已接线 64 → 66——165 个在册仅编译文件全部为有意的骨架/模板/barrel 保留，与「骨架保留」治理用途一致；下一轮建议以 learning-scheduler 已于 v1.25.0 接线（M23），C 类余 7 件。

---

## 三、architecture-kernel · 未接线明细（38）

### 3.1 `01-九层架构分层底座` — 21/21 接线 ✅（M29 · A 类清零）

**结论**：**全接线**（原「契约骨架」判解除）。探针注入端口（`LayerProbe`）+ `NineLayerRegistry` 注册中心（并行探测 · 单层异常隔离）+ 装配层 `reportLayerHealth` 态势对接（`layer-L1..L9` 服务态 → global-status-center 最坏态推导）；新套件 `nine-layer.spec.ts` 5 例（治）。

| 层 | 文件 | 职责 | 状态 | 计划 |
| -- | ---- | ---- | ---- | ---- |
| — | `index.ts`、`types.ts`、`layer-registry.ts` | 统一入口 / 核心类型 / 注册中心 | ✅ | M29 接线 |
| 1 | `layer-1-foundation/*` | 公共基础设施能力底座（配置/日志/观测/存储探针） | ✅ | M29 接线（真实探针归部署侧） |
| 2 | `layer-2-bole/*` | 推荐能力底座 | ✅ | M29 接线（真实探针归部署侧） |
| 3 | `layer-3-prophet/*` | 预测能力底座 | ✅ | M29 接线（真实探针归部署侧） |
| 4 | `layer-4-thinker/*` | 分析能力底座（数据分析标准化工作流） | ✅ | M29 接线（真实探针归部署侧） |
| 5 | `layer-5-navigator/*` | 入口网关能力底座（意图/NLU + self-judge） | ✅ | M29 接线（真实探针归部署侧） |
| 6 | `layer-6-creative/*` | 创意能力底座 | ✅ | M29 接线（真实探针归部署侧） |
| 7 | `layer-7-master/*` | 质量能力底座 | ✅ | M29 接线（真实探针归部署侧） |
| 8 | `layer-8-guardian/*` | 安全能力底座 | ✅ | M29 接线（真实探针归部署侧） |
| 9 | `layer-9-meta-oracle/*` | 全局调度能力底座 | ✅ | M29 接线（真实探针归部署侧） |

> 每层均为 `*-capability.ts` + `index.ts` 两件套，共 9×2 + 2 = 20 个文件。

### 3.2 `02-云枢核心引擎` — 10/21 接线

| 文件 | 职责 | 状态 | 说明 / 计划 |
| ---- | ---- | ---- | ----------- |
| `cloud-pivot-orchestrator/orchestrator.ts` | 云枢编排器（接收意图 → 调度家人） | ⬜ | 依赖 P1 llm-adapter 与家人 intent 链路 |
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

### 3.3 `05-持续学习引擎` — 16/27 接线

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
| `09-可观测性/index.ts` | ◐ | barrel；实现 `metrics-registry` / `family-metrics` / `metrics-server` / `collaboration-instrumentation` 已接线 |

### 3.7 `10-能力注册中心` — 4/4 接线 ✅（P4-T2/T3/T4）

| 文件 | 职责 | 状态 | 说明 |
| ---- | ---- | ---- | ---- |
| `catalog.ts` | 能力目录快照（builtin + local 合并） | ✅ | scope 合并纯函数：组内后者胜、local 必覆盖 builtin、`overriddenIds` 记录；`tests/integration/capability-catalog.spec.js` 覆盖 |
| `plugin-loader.ts` | 插件清单静态注册 | ✅ | fail-fast 校验（id/version/scope/contents.type/ref 格式）；**仅注册不执行**（红线：无动态 import() / 无远程安装 / 无 vm 沙箱） |
| `integrity.ts` | 插件完整性（canonical SHA-256） | ✅ | 内核纯 TS 实现零 `node:` 类型依赖，与 `check-plugins.mjs` 的 node:crypto 双实现对同一金包交叉断言（digest `7b0d3fc3…`） |
| `allowlist.ts` | 准入治理（observe / enforce） | ✅ | `CapabilityAllowlist`：默认 observe（未准入调用**必定**写 `ComplianceAudit` 审计链）、enforce 显式开关拒绝并计数、审计链可注入共享、`filterAllowed` 未准入不可见；`tests/integration/capability-allowlist.spec.js` 覆盖 |

> 金包 `plugins/family-core/plugin.yaml`（skills 13 + mcp-servers 1 + policies 1）由 `scripts/check-plugins.mjs` 校验（`pnpm plugins:check`）与 `tests/contracts/plugin-format.contract.js` 契约覆盖。准入治理复用 `06-治理中心/compliance-audit` 的不可篡改审计链（唯一审计实现，不另造轮子）。

---

## 四、family-agents · 未接线明细（99）

### 4.1 `shared-core` — 35/36 全接线 ✅（仅 llm-adapter barrel 未用）

| 子模块 | 文件数 | 引用方 |
| ------ | ------ | ------ |
| `self-judge-kit` | 6 | 9 处（家人 self-judge / 测试 / 契约） |
| `memory-framework` | 25 | 5 处（测试、程序化记忆提取、编排器） |
| `llm-adapter` | 5 | 4 可达（`types` / `openai-compatible-client` / `zhipu-provider` / `openai-provider`，由 llm-provider 测试覆盖）；barrel 未用 |

> `memory-framework` 覆盖 sensory / working / episodic / semantic / procedural / write-policy / orchestrator 七层。

### 4.2 8 位家人 — 6/104 接线

| 家人 | 层级 | 文件数 | 未接线 | 已接线 |
| ---- | ---- | ------ | ------ | ------ |
| 元启·天枢 `member-tianshu` | core-layer | 13 | 13 | 0 |
| 格物·宗师 `member-grandmaster` | core-layer | 13 | 12 | **1**（`self-judge/index.ts`，2 处引用） |
| 智云·守护 `member-guardian` | core-layer | 13 | 13 | 0 |
| 创想·灵韵 `member-grace` | core-layer | 13 | 13 | 0 |
| 言启·千行 `member-qianhang` | business-layer | 13 | 9 | **4**（`self-judge` + `intent-classifier` / `intent-gateway` / `context-manager`） |
| 千里·伯乐 `member-bole` | business-layer | 13 | 12 | **1**（`emotion/achievement-panel.ts`） |
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
| `providers/` | `openai.provider.ts` | OpenAI 适配 | ✅ 实现（shared-core；成员为薄转发，测试覆盖） |
| | `zhipu.provider.ts` | 智谱适配 | ✅ 实现（shared-core；成员为薄转发，测试覆盖） |
| `self-judge/` | `index.ts` | 家人专属自判断 | ✅（天枢/宗师/千行以外为 ⬜） |

### 4.3 家人自测 — ⊘ 未纳入门禁（8 个）

`family-agents/{core-layer,business-layer}/member-*/tests/self-judge.spec.ts`

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

- P0 验收（v1.2.0）针对「可观测数据面」，其告警与指标均基于**已接线**模块（当前门禁 97 例全绿）
- 未接线模块**不计入**已交付能力；路线图状态以本文与 `§8.3` 为准
- `qianhang-intent-e2e` 已由跳过转为 **4 例真实断言（v2.11.0）**；provider 与意图链路均已接线
- `event-bus` 已补 **重试 + 死信队列（DLQ，v2.12.0）**，门禁显式跳过归零
- LLM 实答 UAT（v2.13.0）为本地门控的真实开放平台抽检，**不入门禁清单**、不计入接线统计；密钥类调用与 hermetic 门禁隔离

---

## 九、变更记录

| 版本 | 日期 | 变更 |
| ---- | ---- | ---- |
| v1.0.0 | 2026-10-23 | 初版：静态可达性分析（241 编译文件 / 80 已接线 / 161 仅编译）；02 与 03 明细；配置未加载 40 个；标准与规范五维矩阵；维护规则 |
| v1.1.0 | 2026-10-23 | P1 智谱 provider 接入后复核：新增 `shared-core/llm-adapter`（3 文件，2 可达）；统计更新为 245 / 83 / 162；8 位家人 `zhipu.provider.ts` 标记为「共享实现 + 薄转发」 |
| v1.2.0 | 2026-10-23 | P1 OpenAI provider 接入后复核：新增兼容基类与 OpenAI provider（llm-adapter 共 5 文件，4 可达）；统计更新为 247 / 85 / 162；`openai.provider.ts` 标记为薄转发 |
| v1.3.0 | 2026-10-23 | P1 意图链路接线后复核：`task-decomposer` 由骨架转实（CAGEERF 七阶段 + owner/dependsOn）；千行 4 文件与伯乐成就面板纳入 e2e 可达集；统计更新为 247 / 90 / 157；e2e 显式跳过降至 1 例（仅 DLQ） |
| v1.4.0 | 2026-10-23 | EventBus 重试 + DLQ 落地后复核：`event-bus` 属存量已接线文件（仅功能增强，无新增/移出编译单元），统计维持 247 / 90 / 157；family-bus 用例 7/7 并归入「愈」，显式跳过归零，门禁 97/97 |
| v1.5.0 | 2026-10-23 | LLM 实答 UAT（v2.13.0）复核：`tests/uat/llm-live-uat.spec.ts` 不在 tsconfig include 内、不在回归 SPECS 清单，门禁入口维持 13 个；统计维持 247 / 90 / 157 |
| v1.6.0 | 2026-10-23 | P1-T1/T2 落地：新增 `tests/contracts/manifest.contract.ts`、`tests/contracts/agent-card.contract.ts` 两个门禁入口（13 → 15）；统计 249 / 92 / 157；门禁 97 → **112 例全绿** |
| v1.7.0 | 2026-10-23 | P1-T3 落地：MCP 适配层（codec + stdio transport）由骨架转实，`EventBus.registerMcpAdapter` 空壳补全；新增 `tests/integration/mcp-adapter.spec.ts` 门禁入口（15 → 16）；统计 250 / 93 / 157；门禁 112 → **121 例全绿** |
| v1.8.0 | 2026-10-23 | P1-T4 落地：五维指标映射（`assets/schemas/five-dimension-map.json`）+ 协同度 4 项 Gauge + 4 条告警；新增 `tests/integration/five-dimension-metrics.spec.ts` 门禁入口（16 → 17）；统计 251 / 94 / 157；门禁 121 → **127 例全绿** |
| v1.9.0 | 2026-10-23 | P1-T5 落地：提示词契约（16 个 `*.prompt.ts` 升级 CO-STAR 七要素 + `PROMPT_META` 元数据，版本回写清单 `prompts` 段）；新增 `tests/contracts/prompt.contract.ts` 门禁入口（17 → 18）；统计 252 / 95 / 157；门禁 127 → **135 例全绿** |
| v1.10.0 | 2026-10-23 | 目录去编号（`02-architecture-kernel` → `architecture-kernel`、`03-family-agents` → `family-agents`，51 文件同步全仓 0 残留）+ P1-T4b 协同度生产接线（09 可观测性四仪表 + `recordReplay` 两端记账 + 装配层自动接线）；新增 `tests/integration/collaboration-wiring.spec.ts` 门禁入口（18 → 19）；统计 252 / 95 / 157 → **254 / 97 / 157**；门禁 135 → **143 例全绿** |
| v1.11.0 | 2026-10-23 | P3 首批落地（《技能与生态演进指导》§8）：45 条技能全版本化（清单 + `manifest:check` 强校验）+ `skills/{owner}/{slug}/SKILL.md` 产物生成（`gen-skill-artifacts.mjs`，与 Agent Card 同构零漂移）+ MCP 服务端协议语义（`mcp-adapter/server/`，initialize / ping / tools/list，对齐 2026-07-28 无状态核心）；新增 `tests/contracts/skill-artifacts.contract.ts` 与 `tests/integration/mcp-server.spec.ts` 门禁入口（19 → 21）；统计 254 / 97 / 157 → **258 / 101 / 157**；门禁 143 → **156 例全绿** |
| v1.12.0 | 2026-10-23 | P3-T3 统一技能 id（ADR-D2）：kernel 05 新增 `skill-consolidation/skill-id.ts` 纯函数契约（manifest ↔ `learned.*` 命名空间 + 历史 FNV `skill-xxxxxxxx` 归并），双侧 `SkillDefinition.logicalId` + `LearningLoop.logicalIdResolver` 钩子，`SkillRegistry.loadFromManifest / findByLogicalId` 与 `FileSkillStore.findByLogicalId`（已落盘数据零迁移）；新增 `tests/integration/skill-id-unification.spec.ts` 门禁入口（21 → 22）；统计 258 / 101 / 157 → **260 / 103 / 157**；门禁 156 → **164 例全绿** |
| v1.13.0 | 2026-10-23 | P3-T4 渐进披露检索：kernel 05 新增 `skill-consolidation/skill-index.ts`（`SkillIndexEntry` + 确定性 `estimateTokens` + 200 token/条预算），`gen-skill-artifacts.mjs` 派生 `skills/index.json`（45 条元数据索引，与 SKILL.md 正文物理分离，`--check` 一并零漂移），`SkillRegistry.loadIndex / listIndex / match`（tag 3 > id 2 > 描述 1 纯索引匹配）——先查索引后载正文；新增 `tests/integration/skill-progressive-disclosure.spec.ts` 门禁入口（22 → 23）；统计 260 / 103 / 157 → **261 / 104 / 157**；门禁 164 → **173 例全绿** |
| v1.14.0 | 2026-10-23 | P3-T5 行为评测（observe）：kernel 05 新增 `skill-consolidation/skill-eval.ts`（`skillTriggersOn` 确定性词面触发 + `outputShapeOk` 结构判定 + `evaluateSkillCase` 三维评测 + `SKILL_EVAL_MODE='observe'` 默认不阻断 + `enforceEvalOutcome` enforce 路径），金样例资产 `tests/skills/golden.json`（44 例 = active 技能全覆盖，输入取自清单 examples）；新增 `tests/skills/skill-behavior-eval.spec.ts` 门禁入口（23 → 24）；统计修正为 **264 / 107 / 157**（并修正 v1.13.0 合计笔误 261 / 104 → 实为 262 / 105）；门禁 173 → **182 例全绿** |
| v1.15.0 | 2026-10-24 | P3-T6 面板能力供给卡片：`scripts/lib/capability-supply.mjs` 单一事实源（技能 45 = manifest 总数 · 工具 44 = active 映射 MCP 工具名 `.`→`__`/`-`→`_`，planned 不可见 · 插件 0 = `plugins/{id}/plugin.yaml` P4 预留）；`data.json` 增 `capabilities` 段 + 面板「能力供给」卡片区（45 / 44 / 0）；新增 `tests/contracts/capability-supply.contract.ts` 门禁入口（24 → 25）；统计 264 / 107 / 157 → **265 / 108 / 157**；门禁 182 → **188 例全绿**（26 套件，五支柱不变） |
| v1.16.0 | 2026-10-24 | P4-M12 注册中心收官（P4-T1/T2/T4）：能力包格式 `plugins/{id}/plugin.yaml`（id ≡ 目录名 / version 语义化 / scope builtin·local / contents 四类白名单 skills·mcp-servers·policies·prompts / refs 交叉 / targets.agents ⊆ 家人 ∪ {*}）+ 金包 `plugins/family-core`（skills 13 + mcp-servers 1 + policies 1，canonical SHA-256 digest `7b0d3fc3…`，`--write-integrity` 回写幂等）；kernel 新增 `10-能力注册中心` 三模块（`catalog.ts` builtin+local 确定性合并 · `plugin-loader.ts` 静态注册仅注册不执行 · `integrity.ts` 纯 TS SHA-256 权威实现与脚本 node:crypto 双实现交叉断言）+ `scripts/check-plugins.mjs` 校验脚本（含虚拟 root 篡改检测）；新增 `tests/contracts/plugin-format.contract.ts` 与 `tests/integration/capability-catalog.spec.ts` 门禁入口（25 → 27）；统计 265 / 108 / 157 → **270 / 113 / 157**；门禁 188 → **204 例全绿**（28 套件，治 47 → 55） |
| v1.17.0 | 2026-10-24 | P4-T3 准入治理：kernel `10-能力注册中心/allowlist.ts` 新增 `CapabilityAllowlist`——默认 **observe**（未准入调用**必定**写入 `ComplianceAudit` 不可篡改审计链，`policyId=capability-allowlist`）、`enforce` 需**显式**开关（拒绝并计数 `rejectedCount`）、审计链可注入共享 + `verifyAudit()` 防篡改 + `filterAllowed()` 未准入不可见（供 P4-T5 `tools/list` 复用）；新增 `tests/integration/capability-allowlist.spec.ts` 门禁入口（27 → 28）；统计 270 / 113 / 157 → **272 / 115 / 157**；门禁 204 → **212 例全绿**（29 套件，治 55 → 63） |
| v1.18.0 | 2026-10-24 | P4-T5 MCP 工具目录：`scripts/gen-mcp-tools.mjs`（`pnpm mcp:tools` / `mcp:tools:check`）由 manifest active 技能派生 `assets/mcp-tools.json`（44 可见 + 1 planned 不可见，工具名 `.`→`__`/`-`→`_`）；`mcp-adapter/server/protocol.ts` 扩展 `tools/call`——参数校验 → 可见性（未准入不可见，隐藏工具一律 -32602 不泄露存在性）→ Policy 裁决（可接 `CapabilityAllowlist`）→ 同步分派，执行失败按 MCP 语义 `isError`；新增 `tests/contracts/mcp-tools.contract.ts` 与 `tests/integration/mcp-tool-catalog.spec.ts` 门禁入口（28 → 30）；统计 272 / 115 / 157 → **274 / 117 / 157**；门禁 212 → **226 例全绿**（31 套件，治 63 → 71） |
| v1.19.0 | 2026-10-24 | P4-T6 打包检查（M13 收官）：`scripts/pack-plugin.mjs`（`pnpm pack:plugins` / `pack:check`）零依赖确定性 ZIP 打包器（node:zlib deflateRawSync + 表驱动 crc32 + 三段容器手写，固定 DOS 时间戳 / 路径字典序 / UTF-8 flag，同输入恒同字节）；双目标——能力包 `plugins/{id}` → `assets/packs/{id}-{version}.skill`（金包 family-core 1.0.0 · 14 条目 · 9868 B，**入 Git**）+ 分发副本 `packaging/yyc3-ai-family-coding` → `docs/yyc3-ai-family-coding.skill`（3 条目，内容零变化容器归一）；打包前 canonical digest 重算与 `integrity.digest` 比对（篡改即拒绝打包）；`--check` 字节级零漂移 + `--json` 明细，CI 软校验接入；新增 `tests/contracts/pack-plugins.contract.ts` 与 `tests/integration/plugin-pack.spec.ts` 门禁入口（30 → 32）；统计 274 / 117 / 157 → **276 / 119 / 157**；门禁 226 → **238 例全绿**（33 套件，治 71 → 77） |
| v1.20.0 | 2026-10-24 | §6.3 能力供给指标**生产端接线**（P5 组合阶段收尾）：kernel `09-可观测性/capability-instrumentation.ts` 三仪表——`instrumentSkillRegistry`（loadFromManifest 非 planned 逐技能记账）/ `instrumentMcpDispatcher`（tools/call Policy 放行后 ok|error 记账，策略拒绝不计）/ `instrumentCapabilityAllowlist`（enforce 拒绝记账，observe 不计），零侵入 Proxy / 函数包装范式同 P1-T4b；新增 `tests/integration/capability-instrumentation.spec.ts` 门禁入口（36 → 37，治）；门禁 258 → **263 例全绿**（37 套件，治 88 → 93）；包 2.26.0。**统计口径刷新**：已接线统一为纯静态可达 BFS（相对导入 + `@shared` 别名 + barrel 透传，37 门禁入口为根，可复现）——276 / 119 / 157 → **298 / 133 / 165**（agents 41 → 34 为口径统一所致，无实际拆线；§三/§四 逐文件明细待下轮复核）；P5 新增 kernel 文件 a2a-adapter ×3 / security-policies / capability-instrumentation 与 tests 入口 P2-T1/T2/T4 一并入册 |
| v1.21.0 | 2026-10-24 | **P6-A 家族服务进程装配（M14）**：kernel `08-系统装配/mcp-server-assembly.ts`（`assembleMcpServer`：准入裁决 + traceId 合成 + 仪表化分派一站组装）+ 部署入口 `family-agents/family-server.entry.ts`（`startFamilyServer`：装载仪表化 + MCP 装配 + /metrics 暴露 + introspection 缺省分派）+ 启动器 `scripts/start-family-server.mjs`（`pnpm start` / `start:selftest`，部署资产 stdin 注入 + 隔离编译）；新增 `tests/integration/family-server-assembly.spec.ts` 门禁入口（37 → 38，治）；门禁 263 → **270 例全绿**（38 套件，治 93 → 100）；包 2.27.0；统计 298 / 133 / 165 → **301 / 136 / 165**（新增 kernel 1 + agents 1 均已接线，门禁入口 +1） |
| v1.22.0 | 2026-10-24 | **P6-B 技能执行引擎（M15 · 确定性臂）**：kernel `05-持续学习引擎/skill-consolidation/skill-executor.ts`（`executeManifestSkill`：io.input 契约校验 + `skillTriggersOn` 触发核验（同源 skill-eval）+ steps 计划展开（exec='llm' 待 M16 语义执行臂）+ io.output 骨架）；`family-server.entry.ts` 缺省分派由 introspection 升级（契约违反抛错走 isError，error 率可观测；selftest 按 io.input 自动构造入参）；新增 `tests/integration/skill-executor.spec.ts` 门禁入口（38 → 39，学）；门禁 270 → **276 例全绿**（39 套件，学 88 → 94）；包 2.28.0；统计 301 / 136 / 165 → **302 / 137 / 165**（kernel +1 已接线） |
| v1.23.0 | 2026-10-24 | **P6-C LLM 语义执行臂（M16）**：`protocol.ts` tools/call thenable 自动 await（同步快速路径保持，handle 签名扩 Promise）；`shared-core/llm-adapter/skill-step-executor.ts`（逐步骤提示词 + 注入式 runner + 围栏 JSON 抽取 + io.output 填充与 violations）；`family-server.entry.ts` 接 `llmRunner`/`llm` 配置（契约先行 · 无步骤同步快速路径）；启动器三闸门控（LLM_STEP + 确认语 + Key，缺省确定性臂）；mcp-server.spec +2 例（治·愈）+ 新套件 `llm-step-executor.spec.ts` 6 例（学，假件零网络）；门禁 276 → **284 例全绿**（40 套件，学 94→100 · 治 100→102 · 愈 50→52）；包 2.29.0；统计 302 / 137 / 165 → **305 / 140 / 165**（agents +1 已接线） |
| v1.25.0 | 2026-10-25 | **P8-a 学习调度器转实（M23）**：C 类首选 budget-allocator（剩余记账 + 分维度 min 授予预扣 + ZERO_BUDGET 等待 + release 归还）与 priority-queue（降序稳定有序插入 + peek/list）由 TODO 桩转实；新套件 `learning-scheduler.spec.ts` 5 例（学，含调度闭环与账目守恒）；门禁 289 → **294/294**（42 套件）；包 2.35.0；kernel 已接线 64 → 66（scheduler 三文件经 05 barrel 可达） |
| v1.26.0 | 2026-10-25 | **P8-b 调度器接入装配（M24）**：`runtime-assembly.ts` +`learningScheduler` 选项与 `LearningSchedulerHandle`（requestCycle 优先级入队 / drain 按序授予执行 / available·exhausted·pending 观测）——学习周期配额闸接入运行链（每周期一份 token 份额缺省均分 + 1 次调用；耗尽 skipped-budget 保留回队；周期异常全额归还后透传）；缺省不启用零侵入；新套件 `learning-scheduler-assembly.spec.ts` 5 例（学·愈）；门禁 294 → **299/299**（42 套件 · 入口 42）；包 2.36.0；统计 306/143/163 → **307/144/163**（tests 入口 +1） |
| v1.27.0 | 2026-10-25 | **P8-a 技能生命周期三件转实（M25 · C 类第一批）**：skill-merger（阈值门 + FNV `skill-<8hex>` 确定性固化模板 + toWriteRequest 溯源）· skill-pruner（空闲/频次候选 + protectedIds 治理豁免 + 无 lastUsedAt 视为从未使用）· forgetting-detector（delta 口径确认 + ε=1e-9 容浮点伪影）；新套件 `skill-lifecycle.spec.ts` 5 例（学）；门禁 299 → **304/304**（43 套件 · 入口 43）；包 2.37.0；统计 307/144/163 → **308/148/160**（kernel 已接线 66 → 69，C 类 7 → 4） |
| v1.28.0 | 2026-10-29 | **P8-a 家族编排四件转实（M26 · C 类清零）**：orchestrator（StepDispatcher 分发 + DispatchVerifier 仲裁）· status-center（overall 推导 + 压力阈值）· phone-system（通话/热线/私信全链）· self-healing-controller（InfraActuator + RTO 契约，失败如实 failed）；新套件 `family-ops.spec.ts` 5 例（治）；门禁 304 → **309/309**（44 套件 · 入口 44）；包 2.38.0；统计 308/148/160 → **309/149/156**（kernel 已接线 69 → 73，**C 类清零**）；工作区迁 `personal/` 真身区（AGENTS.md 总规约对齐，此后变更走分支 + PR） |
| v1.29.0 | 2026-10-30 | **P8 收尾双件转实（M27 · 弧线收口）**：merger→registry 装配位（learning-loop `onPromoted` 出口 + runtime-assembly `skillRegistry` 端口 + `consolidatedSkillForRegistry` 适配——steps 序号化 / logicalId 归并 / 内核专有字段不外带，与 procedural-memory SkillRegistry 结构兼容，内核零反向依赖）· 调度闸真实 usage 回填（`usageMeter` 累计计量端口差值冲抵 + `LlmUsageCounter` 生产端 + usage 三元组，无计量器维持 M24 语义）；套件 +6（skill-lifecycle F6–F8 / learning-scheduler-assembly L6–L8）；门禁 309 → **315/315**（44 套件 · 入口 44 · 学 122 · 愈 61）；包 2.39.0；统计 309/149/156 **维持**（端口化零新增文件） |
| v1.30.0 | 2026-10-30 | **部署侧装配合流（M28 · 学习闭环进服务进程）**：`family-server.entry.ts` 新增 `learning` 配置——嵌入内核 `createRuntimeAssembly`：`learningDispatch` 每次分派发布 `task.executed`（异步感知，失败轨迹 completed=false → failure 负样本）· 调度闸 `usageMeter` 自动接 `llmUsage` 计数器 · `skillRegistry` 接服务注册表（promoted 技能 `learned.*` 归并 id 可查；instrumentSkillRegistry 只包 loadFromManifest，落位不污染 skills_loaded 口径）；缺省零侵入；新例 A9–A11；门禁 315 → **318/318**（44 套件 · 入口 44 · 治 114）；包 2.40.0；统计 309/149/156 **维持**（零新增文件） |
| v1.31.0 | 2026-10-30 | **九层底座全接线（M29 · P9-a · A 类清零）**：`LayerProbe` 注入式探针端口（9 层能力类构造器注入，缺省恒 ok / 抛错判 down）+ `layer-registry.ts` 新增 `NineLayerRegistry`（L1–L9 注册 / 自描述 / healthAll 并行聚合 · 单层异常隔离）+ 装配层 `nineLayer` 选项（probes 注入 + `reportLayerHealth` 态势对接——`layer-L1..L9` 服务态 → global-status-center 最坏态推导）；新套件 `nine-layer.spec.ts` 5 例（治）；门禁 318 → **323/323**（**45 套件 · 入口 45** · 治 119）；包 2.41.0；统计 309/149/156 → **311/175/136**（kernel 已接线 73 → 94，**A 类 20 → 0 清零**；§三未接线 58 → 38） |
| v1.32.0 | 2026-10-30 | **npm 双包打包落地（M31 · 复用路线 R1/R2）**：`scripts/pack-npm.mjs`（`pnpm pack:npm`）确定性装配 `@yyc3/ai-family-kernel`（内核 116 源 + 31 vendor · exports 8 子路径 · barrel 仅入包）与 `@yyc3/ai-family-agent`（MCP Server · bin `yyc3-family-server` · 154 产物 · presets/assets 入包）；`@shared` 类型子树 vendor 化（self-judge-kit + memory-framework 纯相对闭包）· 源期别名重写（NodeNext 下 paths 不可靠）· 两包零运行时依赖 + 版本随根（红线断言）；新契约套件 `npm-pack.contract.ts` 4 例（治）；门禁 325 → **329/329**（**46 套件 · 入口 46** · 治 125）；包 2.43.0；统计 311/175/136 → **312/176/136**（tests +1 入口） |
| v1.24.0 | 2026-10-24 | **M22 运行时编排升级 + 仅编译逐文件复核**：① `family-server.entry.ts` `external` 配置（M22 · P7-c）——`shared.a2a-delegate` 工具经 `DelegateClient` 真实委托外部家人（HttpA2aTransport + 启动期 well-known card 发现 + 能力清单闸 + traceId 优先级链与 W3C 头外发）；启动器按实例契约自动装配；A9 套件 +1（注入传输 hermetic + 实活 selftest 委托 `state=completed`）；`instrumentMcpDispatcher` 异步感知修正（thenable 归一——此前异步拒绝错记 ok）；门禁 288 → **289/289**；包 2.34.0（M22 时点）。② §2.5 新增：仅编译 167 文件逐文件归类复核（A 骨架 20 · B barrel 22 · C 功能骨架 9 · D 家人模板衍生 108 · E shared-core 部件 6 · F UAT 2）——**无一处误判已交付或应拆未拆** |

---

> 「***YanYuCloudCube***」
> 「***<admin@0379.email>***」
> 「***Words Initiate Quadrants, Language Serves as Core for the Future***」
> 「***All things converge in cloud pivot; Deep stacks ignite a new era of intelligence***」

**© 2025-2026 YanYuCloudCube™. All Rights Reserved.**
