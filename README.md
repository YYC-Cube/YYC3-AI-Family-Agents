<div align="center">

<img src="./public/yyc3-family.png" alt="YYC³ AI Family Agent" />

# YYC³ AI Family Agent · 五支柱编程体系

### _言启象限 · 语枢未来_

**_Words Initiate Quadrants, Language Serves as Core for Future_**

_万象归元于云枢 · 深栈智启新纪元_

</div>

---

## 🏷️ 徽章

### 项目徽章

[![CI](https://github.com/YYC-Cube/YYC3-Family-AI-Agents/actions/workflows/regression-gate.yml/badge.svg)](https://github.com/YYC-Cube/YYC3-Family-AI-Agents/actions/workflows/regression-gate.yml)
![Regression](https://img.shields.io/badge/Regression-78%2F78%20PASS-2ea44f?style=for-the-badge&logo=checkmarx)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/Node-%E2%89%A520-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Zero Deps](https://img.shields.io/badge/Runtime%20Deps-0-8a2be2?style=for-the-badge)

![License](https://img.shields.io/badge/License-MIT-2ea44f?style=for-the-badge)
![Security](https://img.shields.io/badge/Security-Policy-8a2be2?style=for-the-badge&logo=shield)
![Observability](https://img.shields.io/badge/Metrics-Prometheus-e6522c?style=for-the-badge&logo=prometheus)
![Dashboard](https://img.shields.io/badge/Dashboard-五支柱全绿-1f6feb?style=for-the-badge)

### 五支柱徽章

![自](https://img.shields.io/badge/自·自判断-Self--Judge-5e2c8a?style=for-the-badge)
![知](https://img.shields.io/badge/知·记忆-Memory%20Framework-0088cc?style=for-the-badge)
![学](https://img.shields.io/badge/学·持续学习-Learning%20Loop-2e8b57?style=for-the-badge)
![治](https://img.shields.io/badge/治·治理-Governance-ff8c00?style=for-the-badge)
![愈](https://img.shields.io/badge/愈·自愈-Self--Healing-dc143c?style=for-the-badge)

---

## ✨ 项目简介

**YYC³ AI Family Agent** 是以「**自 · 知 · 学 · 治 · 愈**」五大技术支柱为主线的多智能体协作内核，采用 **TypeScript 严格模式 + 零运行时依赖** 实现，配套统一装配层与 Prometheus 可观测数据面。

| 支柱 | 核心能力 | 关键实现 |
| ---- | -------- | -------- |
| **自 · 自判断** | 结构化置信度、假设登记、偏离检测、升级决策 | `self-judge-kit` · verification-gateway 外验校准 |
| **知 · 记忆** | 七层记忆、写入策略、检索路由、一致性校验 | `memory-framework`（sensory / working / episodic / semantic / procedural …） |
| **学 · 持续学习** | 经验回流、模式提炼、技能固化、回归门禁、回滚 | `experience-reflow` · `stability-guard` · `learning-loop` |
| **治 · 治理** | 策略注册与分发、合规审计链、安全/质量治理 | `policy-registry` · `compliance-audit`（FNV-1a 链式哈希） |
| **愈 · 自愈** | 故障侦测去抖、降级熔断、一致性修复、版本回滚 | `fault-detector` · `degradation-controller` · `rollback-controller` |

**工程特征**

- **零运行时依赖**：指标、HTTP 端点、编译/回归脚本全部基于 Node 标准库
- **端到端装配**：`createRuntimeAssembly()` 一次接线「总线 → 轨迹 → 学习 → 落盘 → 回滚」
- **可观测闭环**：14 项 `family_*` 指标 → `/metrics`（Bearer 鉴权）→ 7 条告警 → 五支柱面板
- **门禁可复现**：`pnpm regression` 单命令完成编译、78 例测试、面板生成与退出码判定

---

## 🏗️ 系统架构

```mermaid
flowchart TB
    subgraph L1["接入与调度"]
        BUS["family-communication-bus<br/>事件总线 · 幂等去重"]
        ORCH["cloud-pivot-orchestrator<br/>任务分解 · 外验网关"]
    end

    subgraph P["五支柱"]
        S["自 · self-judge"]
        M["知 · memory-framework"]
        L["学 · learning-loop"]
        G["治 · governance"]
        H["愈 · self-healing"]
    end

    subgraph ASM["08-系统装配"]
        A["createRuntimeAssembly<br/>startRuntime"]
    end

    subgraph OBS["09-可观测性"]
        MTR["FamilyMetrics（14 项）"]
        SRV["/metrics + /healthz<br/>Bearer 鉴权"]
        DASH["五支柱 Dashboard"]
    end

    BUS --> A
    ORCH --> A
    A --> S & M & L & G & H
    A --> MTR --> SRV
    SRV --> DASH
    H -. 回滚记账 .-> L
```

### 单周期数据流

```mermaid
sequenceDiagram
    autonumber
    participant B as 总线
    participant BR as TrajectoryBridge
    participant LO as LearningLoop
    participant G as 回归门禁
    participant H as RollbackController
    participant S as FileSkillStore

    B->>BR: task.executed
    BR->>LO: 轨迹采集（collector）
    Note over LO: loop.signal(traceId, goldenPass)<br/>标签单独入口，杜绝双采
    LO->>G: runCycle → 回归用例
    alt 零退化
        LO->>S: replaceHistory（active v1.0.0）
    else 出现退化
        LO->>H: healingRollback 钩子
        H->>S: SkillVersioner 状态翻转并落盘
        H-->>LO: healed / failed（RTO≤600s，如实上报）
    end
```

---

## 🚀 快速开始

### 环境要求

| 项 | 要求 |
| --- | --- |
| Node.js | ≥ 20（使用 `node --import` 与内置 `fetch`） |
| TypeScript | `tsc` 可执行（局部或全局安装均可） |
| 包管理器 | pnpm（脚本可直接用 npm 等价命令） |

### 三条命令

```bash
# 1. 类型检查（仓库根）
pnpm typecheck          # 等价 tsc --noEmit

# 2. 全量门禁：隔离编译 → 13 个套件 → 五支柱聚合 → 面板 → 退出码
pnpm regression         # 78 例全绿；5 例显式跳过

# 3. 查看面板（自包含 HTML，无需服务器）
open ops/observability/pillar-dashboard/index.html
```

> `pnpm regression` 不会污染工作区：临时编译目录在系统 temp 下创建并自动清理；`YYC3_KEEP_TMP=1` 可保留用于调试。

### 运行时接入（部署侧示例）

```ts
import { startRuntime } from './02-智能协同架构内核/08-系统装配/runtime-entry.js';

const runtime = await startRuntime({
  storeDir: process.env.YYC3_SKILL_STORE_DIR ?? './data/skills',
  port: Number(process.env.YYC3_METRICS_PORT ?? 9464),
  authToken: process.env.YYC3_METRICS_TOKEN, // 设置即启用 Bearer 鉴权
  consistencySource: gateway.consistencyTracker, // 可选：一致性快照定时上报
});

// ... 运行期：runtime.assembly.bus.publish(...) / runtime.assembly.handleSignal(...)
await runtime.stop(); // 幂等
```

环境变量：`YYC3_SKILL_STORE_DIR` · `YYC3_METRICS_PORT` · `YYC3_METRICS_HOST` · `YYC3_METRICS_TOKEN` · `YYC3_CONSISTENCY_INTERVAL_MS`

---

## 📁 目录结构

```text
YYC3-AI-Family-Agent/
├── 02-智能协同架构内核/          ← 内核（编号顺延）
│   ├── 01-九层架构分层底座/
│   ├── 02-云枢核心引擎/          ← 总线 · 编排 · 外验网关 · 全局态势
│   ├── 05-持续学习引擎/          ← 经验回流 · 技能固化 · 稳定守卫
│   ├── 06-治理中心/              ← 策略注册 · 合规审计 · 安全/质量治理
│   ├── 07-自愈中心/              ← 侦测 · 降级熔断 · 一致性修复 · 回滚
│   ├── 08-系统装配/              ← createRuntimeAssembly · startRuntime
│   └── 09-可观测性/              ← 指标注册器 · FamilyMetrics · /metrics
├── 03-家人Agent实现集/           ← 8 位家人实例与 shared-core
│   ├── core-layer/  business-layer/
│   └── shared-core/              ← self-judge-kit · memory-framework
├── assets/ · configs/ · presets/  ← 资源 / 配置 / 家人预设
├── docs/                         ← 架构设计 · 验收报告 · 接线指导 · L7/L8 计划
├── ops/                          ← Prometheus 规则/抓取 · 面板 · k8s · docker
├── public/                       ← 品牌素材与多平台图标（yyc3-family.png）
├── scripts/                      ← 回归门禁 · 指标推送 · 成员脚手架
├── tests/                        ← unit / integration / e2e / 契约 / 回归基线
├── .github/workflows/            ← regression-gate（typecheck + 门禁）
└── package.json · tsconfig.json
```

---

## 📊 可观测与门禁

### 指标（14 项运行期）

| 类别 | 指标 | 类型 |
| ---- | ---- | ---- |
| 任务与总线 | `family_task_executed_total` · `family_task_execution_duration_seconds` · `family_trajectory_bridge_events_total` | Counter / Histogram |
| 学习 | `family_learning_cycles_total` · `family_learning_promoted_total` · `family_learning_rolled_back_total` · `family_learning_regression_failed_cases` | Counter / Gauge |
| 自判断 | `family_selfjudge_agreement_ratio` · `family_selfjudge_mirage_total` | Gauge |
| 记忆 | `family_memory_retrieval_duration_seconds` | Histogram |
| 自愈 | `family_healing_actions_total` · `family_healing_rto_seconds` · `family_healing_contract_met` · `family_circuit_state` | Counter / Gauge |

**告警（7 条）**：P99 延迟 · 失败率 · 校准漂移 · 记忆检索 P95 · 学习回归失败 · 回归门禁失败 · 五支柱红牌。规则见 [`ops/observability/prometheus-rules.yaml`](ops/observability/prometheus-rules.yaml)。

### 门禁口径

| 项 | 结果 |
| --- | --- |
| 全量用例 | **78 / 78 通过** |
| 显式跳过 | **5 例**（DLQ 1 + 千行意图链路 4，均带原因） |
| 静默套件 | **0** |
| 五支柱 | 自 16 · 知 25 · 学 37 · 治 18 · 愈 23 |
| 类型检查 | `tsc --noEmit` exit 0 |

---

## 🔌 模块接线状态

> 口径：从 13 个门禁入口做静态 import 可达性分析；**「仅编译」不代表已交付能力**。

| 范围 | 编译文件 | 已接线 | 仅编译 |
| ---- | -------- | ------ | ------ |
| `02-智能协同架构内核` | 93 | 34 | 59 |
| `03-家人Agent实现集` | 135 | 33 | 102 |
| `tests`（门禁入口） | 13 | 13 | 0 |
| **合计** | **241** | **80** | **161** |

- `shared-core` 31/31 全接线；8 位家人仅 `member-grandmaster`、`member-qianhang` 的 `self-judge` 被引用
- `01-九层架构分层底座` 20/20 为**契约骨架**，尚未接线
- 8 个家人自测 spec 被 `tsconfig` 排除且不在回归清单

完整明细（含每个文件职责、状态、计划阶段、标准与规范五维矩阵）见 **[未接线模块清单](docs/YYC3-AI-Family-Agent-未接线模块清单.md)**。

---

## 📚 文档

| 文档 | 内容 |
| ---- | ---- |
| [架构设计](docs/YYC3-AI-Family-Agent-架构设计.md) | 五支柱定义、九层底座、§8.3 版本变更（至 v2.7.3） |
| [P0 可观测数据面验收报告](docs/YYC3-AI-Family-Agent-P0可观测数据面验收报告.md) | 7 项 AC 实证、五维评估、遗留项闭环（v1.2.0） |
| [装配层接线指导](docs/YYC3-AI-Family-Agent-装配层接线指导.md) | infra-1～4 分步接线、双采陷阱、适配器代码 |
| [L7 / L8 落地计划](docs/YYC3-AI-Family-Agent-L7-L8落地计划.md) | Exemplars 方案 A · Git 基线 · 步骤/测试/验收/回滚 |
| [未接线模块清单](docs/YYC3-AI-Family-Agent-未接线模块清单.md) | 接线状态盘点 · 骨架与已交付边界 · 标准规范五维矩阵 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 分支、PR、提交规范、质量门禁、文档规范 |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | 行为准则与处理阶梯 |
| [SECURITY.md](SECURITY.md) | 漏洞报告、支持版本、部署安全基线 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更记录 |

---

## 🔖 仓库标签（GitHub Topics）

```text
ai-agents · multi-agent-systems · ai-family · yyc3 · typescript · nodejs
llm · agent-orchestration · ai-governance · guardrails · self-healing
observability · prometheus · memory-framework · rag · zero-dependency
mcp · pnpm · dashboard · human-ai-collaboration
```

一键设置：

```bash
gh repo edit YYC-Cube/YYC3-Family-AI-Agents \
  --add-topic ai-agents --add-topic multi-agent-systems --add-topic ai-family \
  --add-topic yyc3 --add-topic typescript --add-topic nodejs --add-topic llm \
  --add-topic agent-orchestration --add-topic ai-governance --add-topic guardrails \
  --add-topic self-healing --add-topic observability --add-topic prometheus \
  --add-topic memory-framework --add-topic rag --add-topic zero-dependency \
  --add-topic mcp --add-topic pnpm --add-topic dashboard \
  --add-topic human-ai-collaboration
```

**中文关键词**：五支柱 · 自·知·学·治·愈 · AI 家人 · 治理中枢 · 自愈 · 可观测 · 记忆框架 · 持续学习 · 零依赖 · 参数护栏 · 人机协同

---

## 🗺️ 路线图

| 阶段 | 状态 | 内容 |
| --- | --- | --- |
| Phase A–C | ✅ 完成 | 程序化记忆 · 自评-外验闭环 · 经验回流 |
| 三支柱贯通 | ✅ 完成 | 自 → 治 → 学 数据流冒烟（v2.4.1） |
| Phase D/E | ✅ 完成 | 治/愈转实 · 知识更新 · 参数护栏（v2.5.0） |
| P0 可观测 | ✅ 完成 | 指标 → /metrics → 告警 → 面板（v2.7.0–v2.7.2） |
| **P1 真实 LLM** | ⬜ 待启动 | openai / zhipu provider（HTTP + 重试退避），解锁千行意图链路 |
| **L7 Exemplars** | 📋 已规划 | 指标 → trace 下钻（见计划） |
| **L8 Git 基线** | 📋 已规划 | 可追溯与可复现（本仓库即基线） |

---

## 📄 许可与声明

本项目以 **MIT License** 开源（详见 [LICENSE](LICENSE)），允许使用、修改、分发与商业使用，须保留版权与许可声明。

**商标声明**：`YanYuCloudCube`、`YYC³`、`YYC³ AI Family` 及 8 位家人的名称与形象标识为品牌资产；MIT 许可不授予商标使用权。

**安全**：漏洞请勿公开披露，见 [SECURITY.md](SECURITY.md)。

<div align="center">

> 「***YanYuCloudCube***」言启象限 | 语枢未来
> 「***Words Initiate Quadrants, Language Serves as Core for the Future***」
> 「***All things converge in cloud pivot; Deep stacks ignite a new era of intelligence***」

**© 2025-2026 YanYuCloudCube™. All Rights Reserved.**

</div>
