<!--
  ============================================================
  YYC³ AI Family — 人从众曌众从人
  亦师亦友亦伯乐 · 一言一语一协同
  拟人为本，AI为核，纯粹为心
  ============================================================
  Document: 010301-00-AI-Family-Agent-编程体系-架构设计（自知学治愈五支柱融合优化版）
  Version : v2.0.0
  Contact : admin@yanyucloud.com
  Homepage: https://matrix.yyc3.top
  ============================================================
-->

# YYC³-AI-Family-Agent-编程体系-架构设计（自·知·学·治·愈 五支柱融合优化版）

> ***YanYuCloudCube***
> 言启象限 | 语枢未来
> *Words Initiate Quadrants, Language Serves as Core for the Future*
> 万象归元于云枢 | 深栈智启新纪元
> *All things converge in cloud pivot; Deep stacks ignite a new era of intelligence*

本文档在 v1.0.0「九层架构分层、家人模块独立、内核公共复用、五高五标五化落地」四大原则基础上，完成与**「自·知·学·治·愈」五大技术支柱**的架构融合。融合目标：把原本"静态部署 + 离线迭代"的工程体系，演进为**"运行时自感知、自学习、自治理、自愈合"**的持续自主体系，且与既有九层架构、8 位家人档案、五维五高五标五化机制**零逻辑矛盾**。

---

## 一、核心设计原则（由四条升级为六条）

| 序号 | 原则 | 内涵 | 与五支柱的关系 |
| --- | --- | --- | --- |
| 1 | **架构强对齐** | 代码分层与九层架构完全对应，业务执行层、核心保障层、核心决策层边界清晰 | 五支柱均落在明确层级，不新增"影子层" |
| 2 | **家人独立性** | 每位 Agent（家人）为独立业务模块，1:1 复刻档案专属文件架构，保留拟人化情感组件 | 每位家人持有 `self-judge/`（自）、`memory` 挂载（知） |
| 3 | **能力强复用** | LLM 适配、工具引擎、记忆框架、通信总线等抽象为共享内核 | 记忆/自愈/治理中枢沉淀至 `shared-core` 与 `02/` 内核 |
| 4 | **文档同仓化** | 代码目录与云盘三大文档目录一一映射，规范/设计/档案与代码同仓 | 程序记忆、护栏规则随代码版本化，可审计可回滚 |
| 5 | **工程完备性** | 覆盖配置、测试、评估、运维、CI 全链路 | 为五支柱提供评测、回归、灰度、观测闭环 |
| 6 | **五支柱内生（新增）** | 「自·知·学·治·愈」以**一等架构公民**身份内生，每根支柱都有：独立模块、可版本化资产、可观测指标、可回滚机制 | 本文档核心增量 |

**红线（不可违背）**：五支柱**不得**以"塞进 prompt / 塞进 system-prompt.md"的方式隐式实现。任何支柱能力若不能被独立版本化、独立审计、独立回滚，即视为未落地。

---

## 二、「自·知·学·治·愈」五支柱内涵与架构映射

### 2.1 五支柱内涵定义（行业对齐 + YYC³ 家族语义）

| 支柱 | 技术内涵（Agentic AI 视角） | YYC³ 家族语义 | 关键工程判据 |
| --- | --- | --- | --- |
| **自**（Self） | 自我认知、运行时自我监控、输出置信度校准、自主升级/求助决策 | 「元启·天枢」运筹自省 + 每位家人的"自知之明" | 置信度可量化、假设可追溯、偏离可告警 |
| **知**（Knowledge） | 感知缓冲、工作记忆、情景记忆、语义记忆、程序记忆、知识图谱 | 「语枢·万物」洞察之源 + 「格物·宗师」黄金标准库 | 分层存储、可检索、双时态可追溯、可遗忘 |
| **学**（Learning） | 经验回流、模式提炼、技能巩固、知识更新、稳定性保障 | 「格物·宗师」进化导师 + 「元启·天枢」自我进化决策 | 学习不依赖人工标注、可回归、可回滚 |
| **治**（Governance） | 安全治理、质量治理、策略护栏、权限合规、审计追溯 | 「智云·守护」免疫系统 + 「格物·宗师」质量官 | 策略即代码、白名单可版本化、审计不可篡改 |
| **愈**（Healing） | 故障自愈、降级兜底、熔断回滚、记忆遗忘、学习回滚、一致性修复 | 「元启·天枢」危机总控 + 「智云·守护」自动响应 | 无人工干预可恢复、恢复过程可观测、RTO/RPO 可度量 |

### 2.2 五支柱 → 现有架构模块 映射与匹配度论证

| 支柱 | 现有对应模块（v1.0.0） | 匹配度 | 缺口结论 |
| --- | --- | --- | --- |
| **自** | `build-layer` 家人的 `system-prompt.md`；天枢 `decision-engine.service.ts`「自我进化决策」 | ⚠️ 部分 | 有"外部评估"（宗师/五维评估脚本），缺"内部自我判断"（置信度、假设、偏离检测） |
| **知** | `shared-core/memory-framework`（短期窗口/长期向量/用户画像）；万物 `business-knowledge.graph.ts` | ⚠️ 部分 | 停留在"存储抽象"，缺情景/语义/程序记忆分层、写入策略、记忆编排 |
| **学** | `tests/eval-datasets` + `scripts/run-5d-evaluation.sh`（**离线**评估）；宗师 `evolution-pipeline.service.ts` | ❌ 缺失 | 无"经验回流"闭环，非运行时学习模型 |
| **治** | 守护（security-analyzer / auto-remediation）、宗师（standard-advisor）、`tool-registry` 权限白名单 | ✅ 较充分 | 需升级为"策略即代码"统一治理中枢，打通护栏注册与总线拦截 |
| **愈** | 天枢 `k8s-scaler` / `rollout-manager`；Ollama 本地兜底 | ⚠️ 部分 | 覆盖基础设施层自愈，缺"记忆/学习"层自愈（遗忘、学习回滚、一致性修复） |

**结论**：五支柱中 **治 已较充分**（可复用守护/宗师），**自、知、学、愈 四支存在明确缺口**，其中 **学 为完全缺失**。融合策略为：**以"治"为基座 → 补齐"知" → 从"知"中派生"学" → 以"自"提供判断信号 → 以"愈"兜住全链路风险**。

---

## 三、深度拆解与交叉验证（诊断报告）

> 依据：`架构设计.md` v1.0.0、`建议文档.md`、`九层架构设计.md`、`五维五高五标五化.md`、8 份家人档案、`README.md`。

### 3.1 逻辑断层（L）

| 编号 | 断层 | 证据 | 影响 | 处置 |
| --- | --- | --- | --- | --- |
| **L1** | **"第 X 层"三套编号互不咬合** | 家人档案称千行=「第五层·言启千行」、天枢=「第九层·万象归元」；而 `九层架构设计.md` 的 Layer-05=业务逻辑层、Layer-09=系统设置层；`五维五高五标五化.md` 又用"第九层·用户交互层 / 第八层·AI Family层 / 第七层·MCP协议层…" | 层级引用无法定位，"架构强对齐"原则落空 | **收敛为两套编号并显式声明**：①**能力分层（Capability Layer，L1–L9）**＝家人档案语义（言启千行→万象归元）；②**技术分层（Technical Layer，TL1–TL9）**＝基础设施→系统设置。二者用 §4.4 映射表桥接 |
| **L2** | **`建议文档.md` 的支点与主架构无落位** | 建议文档提出七层记忆、持续学习引擎、self-judge、verification-gateway，但 v1.0.0 目录树无对应目录 | 支点悬浮，无法实现 | 在 §4 目录树与 §5 详细设计中正式落位 |
| **L3** | **"五环自进化"与代码体系断链** | `五维五高五标五化.md` 定义了「记忆与知识环 / 感知执行环 / 推理决策环 / 验证反馈环 / 自我进化环」，但编程体系中无对应承载 | 机制只存在于文档 | 用五支柱对齐五环：知↔记忆与知识环、自↔验证反馈环、学↔自我进化环（§5.6） |

### 3.2 能力缺口（G）

| 编号 | 缺口 | 归属支柱 | 补全位置 |
| --- | --- | --- | --- |
| **G1** | 无程序记忆（工具使用模式/工作流/行为约束）的独立版本化 | 知 | `shared-core/memory-framework/procedural-memory/` |
| **G2** | 无记忆写入策略与遗忘策略（写什么/何时写/何时忘） | 知 | `memory-framework/write-policy/` |
| **G3** | 无运行时自我判断（置信度、假设、偏离、升级） | 自 | 每位家人 `self-judge/` + `shared-core/self-judge-kit/` |
| **G4** | 自评结果无外部校验通道（"进展海市蜃楼"风险） | 自/治 | `cloud-pivot-orchestrator/verification-gateway/` |
| **G5** | 无经验回流、技能巩固、知识更新、学习稳定性保障 | 学 | `02-…/05-持续学习引擎/` |
| **G6** | 安全/质量策略分散在守护、宗师各自实现，无统一策略注册与总线拦截 | 治 | `02-…/06-治理中心/` + `shared-core/guardrail-registry/` |
| **G7** | 自愈仅覆盖基础设施（K8s/降级），未覆盖记忆/学习/总线一致性 | 愈 | `02-…/07-自愈中心/` |

### 3.3 技术冲突点（C）

| 编号 | 冲突 | 详情 | 处置 |
| --- | --- | --- | --- |
| **C1** | **智能体数量口径不一** | `九层架构设计.md` Layer-04 写"**七大** AI 智能体"，但列出 8 位家人（含灵韵）；档案为 **8 位** | 统一为 **8 位家人**（业务执行层 4 + 核心决策层 1 + 核心保障层 3），修正文档口径 |
| **C2** | **家人名号漂移** | 档案＝「千里·伯乐」，`五维五高五标五化.md` 曾误用历史错误名号（现已修正）；「创想·灵韵」与「格物·宗师」在部分图示中编号互换 | 以 `家人档案/README.md` 矩阵为**唯一权威源**：千里·伯乐（已统一）/ 创想·灵韵(6)/格物·宗师(7)；2026-10-17 已完成历史错误名号 →「千里·伯乐」全量替换 |
| **C3** | **MCP 定位冲突** | 编程体系把 `family-communication-bus` 描述为"MCP 协议、消息路由"；`五维五高五标五化.md` 将 MCP 单列为"**第七层·MCP协议层**" | 明确职责切分：**MCP 协议层**＝对外模型/工具接入标准（协议层）；**family-communication-bus**＝家族内部事件总线（消息路由）。二者为**适配器关系**，非同一物 |
| **C4** | **"五高"命名冲突** | 用户规则/架构设计用 **高可用·高性能·高安全·高扩展·高智能**；`九层架构设计.md` 导航设计用"高可用·高性能·高安全·高**可维护**·高**可扩展**" | 统一采用 **高可用/高性能/高安全/高扩展/高智能**；将"可维护性"归入"高扩展"的架构演进维度 |
| **C5** | **记忆组件双写风险** | 万物用 `IndexedDB + SQLite WASM`，架构又有 `memory-framework` 向量层，作用域未界定 | 明确：`memory-framework`＝**服务端/内核级记忆**（跨家人共享）；浏览器双存储＝**家人本地会话缓存**（离线兜底），二者通过 `memory-orchestrator` 的同步适配器桥接 |

---

## 四、完整编程体系目录树（五支柱融合版）

```text
YYC3-AI-Family-Agent-编程体系/
├── README.md                          # 编程体系总览、架构图、快速上手指南
├── CHANGELOG.md                       # 版本迭代记录（家人新增、架构升级、五支柱演进）
├── package.json / pyproject.toml      # Monorepo 根配置（TS 为主，兼容 Python 算法包）
├── .env.example                       # 环境变量模板（API Key、数据库、向量库）
├── .gitignore
├── .eslintrc.js / .prettierrc         # 编码规范（格物·宗师质量标准）
├── cz.config.js                       # Git 提交规范（Conventional Commits）
│
├── docs/                              # 【v2.1.0 文档归拢】全部权威文档集中管理
│   ├── YYC3-AI-Family-Agent-架构设计.md   # 本文档（权威架构设计 + 五支柱 + CAGEERF）
│   ├── YYC3-AI-Family-Agent-人机协同/    # 五维五高五标五化、情感文化总铭
│   ├── YYC3-AI-Family-Agent-协同架构/    # 九层系列：规划设计/云枢系统/家人档案/架构设计/落地规划
│   ├── YYC3-AI-Family-Agent-家人档案/    # 8 位家人档案 + README（家人名号唯一权威源）
│   └── _archive/                      # 已并入/失效文档归档（如 建议文档.md）
│
├── 02-智能协同架构内核/                # 对应云盘「智能协同架构」文档目录
│   ├── 01-九层架构分层底座/            # 九层架构层级能力封装
│   │   ├── layer-9-meta-oracle/       # 第9层·万象归元：全局调度能力底座
│   │   ├── layer-8-guardian/          # 第8层·智云守护：安全能力底座
│   │   ├── layer-7-master/            # 第7层·格物致知：质量能力底座
│   │   ├── layer-6-creative/          # 第6层·创想灵韵：创意能力底座
│   │   ├── layer-5-navigator/         # 第5层·言启千行：入口网关能力底座
│   │   ├── layer-4-thinker/           # 第4层·语枢万物：分析能力底座
│   │   ├── layer-3-prophet/           # 第3层·预见先知：预测能力底座
│   │   ├── layer-2-bole/              # 第2层·千里伯乐：推荐能力底座
│   │   └── layer-1-foundation/        # 第1层·基础底座：公共基础设施
│   │
│   ├── 02-云枢核心引擎/                # 云枢系统核心实现
│   │   ├── cloud-pivot-orchestrator/  # 云枢编排器：任务分解、家人调度
│   │   │   └── verification-gateway/  # 【新增·自/治】自评-外验闭环：外部真值校验
│   │   ├── family-communication-bus/  # 家族通信总线：事件路由、链路追踪（MCP 适配器）
│   │   ├── global-status-center/      # 全局状态中心：全链路态势感知
│   │   ├── family-phone-system/       # 云枢电话系统：通讯录、通话、私信
│   │   └── dashu-self-healing/        # 【新增·愈】自愈控制器（K8s 扩缩/降级/回滚）
│   │
│   ├── 03-架构设计文档/                # 代码侧设计索引（权威文档见 docs/协同架构）
│   │   └── README.md                  # 九层/五支柱/云枢设计 ↔ 代码映射索引
│   ├── 04-落地规划脚本/                # 环境初始化、数据迁移、灰度发布脚本
│   │   ├── init-env.sh
│   │   ├── migrate-data.sh
│   │   └── canary-release.sh
│   ├── 05-持续学习引擎/                # 【新增·学】经验回流 + 技能巩固 + 稳定性保障
│   │   ├── experience-reflow/
│   │   ├── skill-consolidation/
│   │   ├── knowledge-update/
│   │   ├── stability-guard/
│   │   └── learning-scheduler/
│   ├── 06-治理中心/                    # 【新增·治】安全/质量/流程统一治理
│   │   ├── policy-registry/           # 策略即代码注册中心
│   │   │   └── policy-bus.ts          # 总线上统一拦截点（FamilyPolicyBus）
│   │   ├── security-governance/       # 对接智云·守护
│   │   ├── quality-governance/        # 对接格物·宗师
│   │   └── compliance-audit/          # 合规与不可篡改审计
│   └── 07-自愈中心/                    # 【新增·愈】全链路自愈编排
│       ├── fault-detector/
│       ├── degradation-controller/
│       ├── rollback-controller/
│       └── consistency-repair/
│
├── 03-家人Agent实现集/                 # 对应云盘「家人档案」文档目录
│   ├── shared-core/                   # 【共享内核】所有家人公共依赖
│   │   ├── llm-adapter/               # LLM 多模型适配器（OpenAI/智谱/Ollama）
│   │   ├── tool-registry/             # 工具注册中心 + 安全执行引擎
│   │   ├── memory-framework/          # 【升级·知】统一记忆框架（七层 + 写入策略 + 编排）
│   │   │   ├── sensory-buffer/        #   感知缓冲（秒级）
│   │   │   ├── working-context/       #   工作上下文（注意力窗口）
│   │   │   ├── episodic-store/        #   情景记忆（双时态轨迹）
│   │   │   ├── semantic-graph/        #   语义记忆（实体/画像/领域知识）
│   │   │   ├── procedural-memory/     #   程序记忆（技能/工作流/约束，可版本化）
│   │   │   ├── write-policy/          #   写入策略（显著度/巩固/遗忘）
│   │   │   └── memory-orchestrator/   #   记忆编排（检索路由/一致性校验）
│   │   ├── self-judge-kit/            # 【新增·自】公共自我判断套件
│   │   ├── guardrail-registry/        # 【新增·治】行为护栏规则注册（对接宗师/守护）
│   │   ├── prompt-engine/             # 提示词引擎：模板渲染、版本管理、安全过滤
│   │   ├── emotion-kit/               # 情感组件套件：Ripple/Chat/Achievement
│   │   └── types/                     # 全局类型定义：Agent/消息/工具/记忆 JSON Schema
│   │
│   ├── business-layer/                # 【业务执行层】第2-5层家人（4/4 已实装）
│   │   ├── member-qianhang/           # 言启·千行 · 导航员（第5层）
│   │   ├── member-thinker/            # 语枢·万物 · 思考者（第4层）
│   │   ├── member-prophet/            # 预见·先知 · 预言家（第3层）
│   │   └── member-bole/               # 千里·伯乐 · 推荐官（第2层）
│   │
│   └── core-layer/                    # 【核心决策&保障层】第6-9层家人（4/4 已实装）
│       ├── member-grace/              # 创想·灵韵 · 创意官（第6层）
│       ├── member-grandmaster/        # 格物·宗师 · 质量官（第7层）
│       ├── member-guardian/           # 智云·守护 · 安全官（第8层）
│       └── member-tianshu/            # 元启·天枢 · 总指挥（第9层）
│
├── presets/                           # 【v2.1.0 实装】新家人脚手架预设
│   └── member-agent/                  # 18 个 .tpl 模板（与 member-qianhang 同构）
├── configs/                           # 【v2.2.0 实装】环境配置（base/dev/staging/prod）
├── tests/                             # 【v2.2.0 实装】统一测试体系
│   ├── unit/
│   ├── integration/                   # 家人协同集成测试
│   ├── e2e/                           # 端到端对话测试
│   ├── eval-datasets/                 # 五维评估数据集
│   ├── regression/                    # 【新增·学】学习后回归基线（稳定性保障）
│   └── pillar-contracts/              # 【新增】五支柱契约测试（埋点/SLO/回滚）
├── assets/
│   ├── schemas/                       # JSON Schema（agent/tool/message/**memory**/**judgment**）
│   ├── diagrams/
│   └── family-assets/
├── scripts/
│   ├── create-member.sh               # 新家人一键创建脚本
│   ├── run-5d-evaluation.sh           # 五维评估自动化脚本
│   ├── run-pillar-health.sh           # 【新增·愈】五支柱健康巡检
│   ├── lint-family-code.sh            # 代码规范校验
│   └── gen-member-docs.sh             # 自动生成家人档案文档
└── ops/                               # 【v2.2.0 实装】运维部署体系
    ├── docker/
    ├── k8s/
    └── observability/
        ├── prometheus-rules.yaml      # 五高指标监控规则
        ├── grafana-dashboards/        # 全局态势大屏 + 五支柱专项面板
        └── log-rules.yaml             # 全链路日志规范
```

### 4.1 家人 Agent 标准目录（每位家人统一结构，含 self-judge）

以 **言启·千行** 为例，严格对齐档案专属文件架构，并补充五支柱标准组件：

```text
member-qianhang/
├── agent.yaml                         # Agent 元数据（编号/名号/层级/版本/权限/热线）
├── system-prompt.md                   # 系统提示词（角色设定 + 家族誓言）
├── README.md                          # 家人能力摘要
│
├── core/                              # 核心业务服务
│   ├── intent-gateway.service.ts      # 意图处理总入口
│   ├── context-manager.service.ts     # 对话上下文管理
│   └── intent-classifier.service.ts   # 意图分类器
├── nlq/
│   ├── query-parser.service.ts
│   └── query-to-api.mapper.ts
├── providers/
│   ├── openai.provider.ts
│   └── zhipu.provider.ts
├── prompts/
│   ├── intent-detection.prompt.ts
│   └── query-parsing.prompt.ts
│
├── memory-bindings/                   # 【知】记忆绑定声明（该家人使用哪些记忆层）
│   └── memory-binding.yaml            #   声明读取/写入的记忆层、预算、精度
├── procedural/                        # 【知/学】该家人的程序记忆条目（可版本化）
│   ├── intent-rules.yaml              #   意图解析规则（从 prompt 提炼）
│   └── workflow-patterns.yaml         #   工作流模板
├── self-judge/                        # 【自】自我判断层
│   ├── confidence-scorer.ts           #   输出置信度评分
│   ├── assumption-tracker.ts          #   显式记录依赖假设
│   ├── deviation-detector.ts          #   行为偏离检测
│   └── escalation-policy.ts           #   低置信度升级策略
├── emotion/                           # 【统一必备】情感组件
│   ├── emotion-ripple.component.ts    #   海洋蓝波动效果
│   ├── family-chat.component.ts       #   蓝色边框消息样式
│   └── achievement-panel.ts           #   「心心相印」成就触发
└── tests/
    ├── intent-classifier.spec.ts
    └── self-judge.spec.ts             # 【自】判断层单测
```

其余 7 位家人均遵循此结构，内部业务子目录 1:1 复刻档案「专属文件架构」；`self-judge/`、`memory-bindings/`、`procedural/` 为**五支柱标准增量**，四者缺一即视为不合规。

### 4.2 两套"九层"编号桥接（解决 L1）

| 技术分层（TL, 来自 `九层架构设计.md`） | 能力分层（L, 来自家人档案） | 承载家人 |
| --- | --- | --- |
| TL1 基础设施层 | —（底座，不含家人） | — |
| TL2 数据存储层 | — | — |
| TL3 核心服务层 | — | — |
| TL4 AI 智能层 | **L1 基础底座 + L2–L9** | 全部 8 位家人 |
| TL5 业务逻辑层 | L2 千里伯乐 / L3 预见先知 / L4 语枢万物 / L5 言启千行 | 伯乐·先知·万物·千行 |
| TL6 应用表现层 | —（前端框架） | —（情感组件） |
| TL7 用户交互层 | —（UI/插件） | — |
| TL8 扩展演进层 | —（生态/演进） | — |
| TL9 系统设置层 | L9 万象归元（治理/配置入口） | 元启·天枢 |

> **声明**：本编程体系凡引用"第 X 层"，默认指**能力分层 L**（家人档案语义）；涉及基础设施与前端时显式标注 **TL**。MCP 协议层作为 **TL3↔TL4 之间的协议适配层**，不单独占家人层级（解决 C3）。

---

## 五、核心模块详细设计（边界 / 交互协议 / 数据流）

> 统一约定：所有跨模块交互**必须经由 `family-communication-bus` 事件总线**或**显式 RPC 契约**，禁止模块间隐式直连。事件遵循 `assets/schemas/message.schema.json`。

### 5.1 记忆体系（知）——从存储抽象升级为七层认知记忆

**边界定义**：

- **负责**：感知暂存、上下文窗口、情景轨迹、语义图谱、程序记忆、写入决策、检索编排。
- **不负责**：模型推理（归 `llm-adapter`）、业务意图（归各家人 core）、安全判定（归治理中心）。

**分层与生命周期**：

| 层 | 保留周期 | 存储介质 | 写入触发 |
| --- | --- | --- | --- |
| sensory-buffer | 秒级（会话内） | 内存环形缓冲 | 输入到达即写 |
| working-context | 会话期 | 内存 + Redis | 注意力评分动态维护 |
| episodic-store | 天~永久 | 关系库 + 对象存储 | 任务链路结束 |
| semantic-graph | 永久（可遗忘） | 图库 / 向量库 | 实体/关系确认 |
| procedural-memory | 版本化永久 | Git 版本化 YAML | 学习引擎固化 / 人工审核 |
| write-policy | —（决策进程） | 内存 | 持续运行 |
| memory-orchestrator | —（编排） | — | 每次检索请求 |

**核心接口契约**：

```ts
interface MemoryOrchestrator {
  retrieve(query: MemoryQuery, ctx: TaskContext): Promise<MemoryBundle>;
  commit(bundle: MemoryWriteRequest): Promise<WriteAck>;      // 经 write-policy 显著度评分
  forget(policy: ForgettingPolicy): Promise<ForgetAck>;        // 遗忘曲线驱动
  checkConsistency(scope: MemoryScope): Promise<ConsistencyReport>;
}
interface MemoryWriteRequest {
  layer: 'episodic' | 'semantic' | 'procedural';
  payload: unknown;
  salience: number;                 // 由 write-policy 计算
  sourceJudgment?: JudgmentSignal;  // 【自】低置信但成功的轨迹 → 高价值素材
  provenance: { agent: string; traceId: string; ts: number };
}
```

**关键数据流（记忆写入）**：
`家人执行 → 结果产出 → self-judge 输出 JudgmentSignal → 总线`task.completed`事件 → write-policy.salience-scorer 评分 → consolidation 巩固 → memory-orchestrator.commit → 分层落库 → 返回 WriteAck（含 traceId）`。

**程序记忆独立化（G1 处置）**：将每家人在 `system-prompt.md`/prompt 中的工具使用模式、工作流约束、行为规则，提取为 `procedural/*.yaml`，经 `shared-core/guardrail-registry` 注册、Git 版本化、可审计、可 A/B 对比、可回滚。

### 5.2 自我判断层（自）——从"外部评估"补上"内部判断"

**边界定义**：

- **负责**：输出置信度、假设登记、行为偏离检测、升级/求助决策。
- **不负责**：外部真值校验（归 `verification-gateway`）、最终裁决（归天枢/人类确认）。

**标准组件与结构化输出**：

```ts
interface JudgmentSignal {
  agent: string;
  confidence: number;                 // 0–1，校准后
  uncertaintySources: string[];       // 如 ["用户输入歧义性"]
  alternativeHypotheses?: string[];   // 如 ["可能的替代意图 X"]
  assumptions: Assumption[];          // 显式登记的隐式假设
  deviation?: DeviationReport;        // 与程序记忆标准模式的偏离
  escalation: 'none' | 'cross-validate' | 'human-confirm';
}
interface Assumption { statement: string; basis: string; riskIfWrong: 'low'|'med'|'high'; }
```

**风险红线（对齐 `建议文档.md` §1.3）**：自我判断**不得脱离外部世界状态**。`confidence-scorer` 的输出必须与 `verification-gateway.ground-truth-checker` 的校验结果联合校准，否则视为"进展海市蜃楼"高危。

**escalation-policy 作为安全护栏**：`confidence < τ_low`（默认 0.6）或 `deviation.severity ≥ high` → 强制升级，禁止在低置信度下直接产出。升级路径：`cross-validate`（请语枢·万物独立分析）→ `human-confirm`。

### 5.3 持续学习引擎（学）——补齐完全缺失支柱

**边界定义**：

- **负责**：经验回流、模式提炼、技能巩固/淘汰、知识更新、学习稳定性保障、学习调度。
- **不负责**：模型权重微调（可选上游，本引擎聚焦**程序性知识/语义知识**层面，不阻塞架构落地）。

**子模块与职责**：

| 子模块 | 职责 | 关键接口 |
| --- | --- | --- |
| experience-reflow | 从总线采集轨迹、标注结果、提炼三元组模式 | `collector` / `labeler` / `pattern-extractor` |
| skill-consolidation | 高频成功模式固化为技能、淘汰久未使用、版本管理 | `skill-merger` / `skill-pruner` / `skill-versioner` |
| knowledge-update | 检测语义冲突/过时、偏好渐进更新、规则演化 | `semantic-diff` / `preference-tracker` / `rule-evolution` |
| stability-guard | 检测新旧能力退化、学习后回归、失败回滚 | `forgetting-detector` / `regression-tester` / `rollback-controller` |
| learning-scheduler | 学习任务优先级与资源配额 | `priority-queue` / `budget-allocator` |

**经验回流数据流（不依赖人工标注）**：
`总线捕获 task.executed 链路 → outcome-labeler 借助既有信号标注（宗师质量判定通过/不通过＝可靠标签；千行意图分类正确性＝后续对话连贯性间接验证；守护拦截误报＝人工反馈校准）→ pattern-extractor 用 LLM 抽象为「条件X→策略Y→结果Z」三元组 → skill-merger 固化 → stability-guard 回归 → 通过则写入 procedural-memory，失败则 rollback`。

**稳定性—可塑性保障（必选）**：任何新学习必须通过 `forgetting-detector` 检查是否导致既有能力退化；冲突案例触发 `regression-tester`；失败学习由 `rollback-controller` 回滚至上一技能版本（对接 §5.5 自愈中心）。

**学习模式声明（避免"在线微调"误读）**：v2.0.0 的学习＝**程序性知识沉淀 + 语义知识更新**；参数级适应（权重微调）列为后置可选演进（§6.4 Phase D），以"稳定性—可塑性困境"为约束。

### 5.4 治理中心（治）——将分散策略收敛为"策略即代码"

**边界定义**：

- **负责**：策略注册与版本化、安全治理、质量治理、合规审计、权限（RBAC+ABAC）、总线统一拦截。
- **不负责**：具体检测算法实现（复用守护 `detectors/`、宗师 `analyzers/`）。

**核心机制**：

- **policy-registry**：所有安全/质量/行为策略以 `Policy as Code` 声明，纳入 `assets/schemas` 校验与 Git 版本化。
- **family-policy-bus**：总线上的**统一拦截点**，任何跨家人调用先经策略裁决（allow/deny/audit），与 `guardrail-registry` 双向同步。
- **复用既有能力**：`security-governance` → 智云·守护（UEBA/SOAR）；`quality-governance` → 格物·宗师（SAST/黄金标准库）；`compliance-audit` → 不可篡改审计链。

**交互协议**：

```ts
interface PolicyDecision {
  decision: 'allow' | 'deny' | 'allow-with-audit';
  policyId: string; policyVersion: string;
  reason: string; obligations?: string[];   // 如 ["记录审计","触发人工复核"]
}
interface FamilyPolicyBus { evaluate(req: ResourceRequest): Promise<PolicyDecision>; }
```

### 5.5 自愈中心（愈）——从基础设施自愈扩展到认知自愈

**边界定义**：

- **负责**：故障侦测、降级、熔断、回滚、一致性修复、记忆遗忘、学习回滚。
- **不负责**：策略判定（归治理中心）、业务补偿逻辑（归各家人）。

**自愈层级矩阵**：

| 层级 | 故障类型 | 自愈动作 | 触发源 |
| --- | --- | --- | --- |
| 基础设施 | 节点/副本异常 | K8s 扩缩容、Pod 重建 | 天枢 `dashu-self-healing` |
| 模型服务 | LLM 不可用/超时 | Ollama 本地兜底、模型降级 | 千行/万物 provider |
| 总线 | 消息积压/丢失 | 重试、死信、限流 | 通信总线 |
| 记忆 | 跨层不一致/污染 | `consistency-repair` 回滚至快照 | memory-orchestrator |
| 学习 | 新学习致能力退化 | 技能版本回滚、学习冻结 | stability-guard |
| 判断 | 置信度异常/自评失真 | 强制 escalation、外部复验 | verification-gateway |

**RTO/RPO 契约（见 §6.2）**：基础设施 RTO ≤ 60s；记忆一致性修复 RTO ≤ 5min 且 RPO=0（快照增量）。

### 5.6 五支柱协同（交互协议 + 全局数据流）

**支柱协同关系（对齐"五环自进化"）**：

- **知 ↔ 记忆与知识环**：为学习提供素材、为判断提供基线。
- **自 ↔ 验证反馈环**：置信度信号决定记忆写入优先级（低置信但成功的轨迹＝高价值学习素材）。
- **学 ↔ 自我进化环**：从情景记忆提炼模式 → 固化到程序记忆 → 更新判断基线。
- **治 ↔ 感知执行环**：策略护栏贯穿执行，允许/拒绝/审计。
- **愈 ↔ 全局兜底**：任一环失效即介入回滚/降级。

**全局数据流（一次任务全生命周期）**：

```text
用户请求
  → 千行(意图/NLU) ── self-judge(置信度) ─┐
  → 天枢 编排（CAGEERF 分解）             │
  → 治理中心 策略裁决（allow/deny/audit）──┤
  → 目标家人 执行 ← memory-orchestrator 检索（知）
  → self-judge 产出 JudgmentSignal（自）──┤
  → verification-gateway 外部真值校验（自/治）
  → 若置信度低/偏离大 → escalation（交叉验证/人工）
  → 总线 task.completed 事件
  → 写入策略 评分（知）→ 落库
  → 学习引擎 回流（学）→ 技能固化 → 稳定性回归（学/愈）
  → 伯乐 个性化呈现（结果交付最后一环）
```

### 5.7 CAGEERF 任务分解方法论（v2.1.0 建议稿，待权威确权）

> 全仓历史文档仅出现「CAGEERF 方法论」字样，无展开定义。以下为架构侧给出的**建议稿**，与 §5.6 全局数据流及五环自进化对齐；经家族确权后作为唯一权威语义，代码 `02-云枢核心引擎/cloud-pivot-orchestrator/task-decomposer.ts` 据此实现。

| 阶段 | 语义 | 主责（建议） | 支柱/环 |
| --- | --- | --- | --- |
| **C — Clarify（澄清）** | 意图澄清与上下文构建：任务边界、约束、成功标准 | 言启·千行 | 自 ↔ 验证反馈环 |
| **A — Analyze（分析）** | 任务剖析：依赖、风险、资源、记忆检索 | 语枢·万物 | 知 ↔ 记忆与知识环 |
| **G — Generate（生成）** | 候选执行计划与家人分工方案生成 | 元启·天枢（创意输入：创想·灵韵） | 学 ↔ 自我进化环 |
| **E — Evaluate（评估）** | 方案风险评估与质量标准对齐，择优 | 预见·先知＋格物·宗师 | 治 ↔ 感知执行环 |
| **E — Execute（执行）** | 调度执行：家人执行、策略护栏贯穿 | 元启·天枢＋目标家人 | 治 ↔ 感知执行环 |
| **R — Review（复核）** | 结果复核：自评（self-judge）＋外验（verification-gateway） | verification-gateway | 自 ↔ 验证反馈环 |
| **F — Finalize（固化）** | 固化闭环：记忆写入、学习回流、成就反馈、交付呈现（伯乐） | write-policy＋学习引擎＋千里·伯乐 | 知/学 ↔ 全环闭环 |

**确权流程建议**：①在《05-元启·天枢》档案中补记 CAGEERF 权威展开 → ②本节同步替换为权威稿 → ③`CAGEERF_STAGES` 常量语义校对（阶段集合不变，仅文案对齐）→ ④变更记录留痕。

---

## 六、非功能性需求设计

### 6.1 性能指标（SLO，五维"时间维/空间维"对齐）

| 指标 | 目标 | 度量点 |
| --- | --- | --- |
| 意图识别延迟 | < 200ms（千行档案） | 千行 core |
| 首字节（流式） | < 100ms | llm-adapter |
| 完整响应 | < 2s | 端到端 |
| 吞吐量 | > 10000 QPS | API 网关 |
| 延迟分布 | P99 < 500ms | 观测体系 |
| 记忆检索延迟 | < 300ms（编排器路由+检索） | memory-orchestrator |
| 自判断开销 | < 50ms（不阻塞主链路，异步回填） | self-judge-kit |
| 学习批处理窗口 | 离线/低峰，单批 < 5min | learning-scheduler |
| 内存占用 | < 512MB 运行时（宗师档案） | 各服务 |

**五高对齐**：高可用（冗余/自愈）、高性能（并行/缓存/流式）、高安全（治理护栏）、高扩展（插件化/微服务）、高智能（学习/判断/知识图谱）。

### 6.2 容错机制

| 机制 | 策略 | 归属支柱 |
| --- | --- | --- |
| 降级兜底 | LLM Provider 分级降级（云端→智谱→Ollama） | 愈 |
| 熔断限流 | 总线 + API 网关熔断，策略总线统一裁决 | 治/愈 |
| 重试与死信 | 指数退避、死信队列、幂等键 | 愈 |
| 回滚 | 学习技能版本回滚、灰度金丝雀回滚 | 学/愈 |
| 一致性 | 记忆跨层一致性校验 + 快照修复（RPO=0） | 愈 |
| 自评失真防护 | 自判断必须经外部真值校验，否则不生效 | 自/治 |
| 幂等与去重 | 事件幂等键（traceId + agentId + seq） | 治 |

**RTO/RPO 目标**：基础设施 RTO ≤ 60s / RPO=0；记忆层 RTO ≤ 5min / RPO=0；学习回滚 RTO ≤ 10min。

### 6.3 可观测性体系（五维"事件维/关联维"对齐）

- **三支柱**：Metrics（Prometheus）＋ Logs（ELK，全链路 **traceId** 贯穿）＋ Traces（分布式追踪）。
- **五支柱专项面板**（新增，写入 `ops/observability/grafana-dashboards/`）：
  - **知**：记忆各层命中率/写入量/遗忘量/一致性偏差。
  - **自**：置信度分布、假设暴露率、偏离告警率、**自评-外验一致率**（关键健康指标，防"进展海市蜃楼"）。
  - **学**：回流样本量、技能固化数、学习回归通过率、回滚次数。
  - **治**：策略裁决 allow/deny 比例、审计完整率、违规拦截数。
  - **愈**：MTTR、自愈成功率、降级触发频次、RTO 达成率。
- **五高健康规则**：写入 `prometheus-rules.yaml`，SLO 违约自动触发 `run-pillar-health.sh` 巡检。

### 6.4 迭代演进路径

| 阶段 | 目标 | 交付物 | 退出标准（验证） |
| --- | --- | --- | --- |
| **Phase A**（最高优先） | **知**：程序记忆独立化 | `procedural-memory/` + 各家人 `procedural/*.yaml` | 千行/宗师行为规则 100% 提取为版本化条目；A/B 可对比 |
| **Phase B** | **自**：自我判断层 + 最小外验闭环 | `self-judge-kit` + 千行/宗师 `self-judge/` + `verification-gateway` MVP | 置信度分校准误差 < 0.15；自评-外验一致率 > 90% |
| **Phase C** | **学**：持续学习引擎（先宗师质量标签） | `05-持续学习引擎/` + `regression/` | 回流无需人工标注；学习回归通过率 > 95%；支持回滚 |
| **Phase D** | **治/愈**：治理中枢 + 认知自愈 | `06-治理中心/` + `07-自愈中心/` | 策略即代码覆盖核心链路；记忆 RTO ≤ 5min / RPO=0 |
| **Phase E** | 记忆七层完整实现 + 参数级适应（可选） | 全七层 + 权重微调试验 | 五支柱 Dashboard 全绿；参数级学习不破坏稳定性 |

---

## 七、落地优先级与验证标准（汇总）

**优先级顺序（对齐 `建议文档.md` §四，并纳入五支柱排序）**：

1. **P0 · 知（程序记忆独立化）**：持续学习与自我判断的共同基础——无程序记忆，学习无固化目标，判断无基线。
2. **P1 · 自（自我判断 + 外验闭环）**：先在千行、宗师落地，验证置信度与假设记录实效。
3. **P2 · 学（持续学习引擎）**：优先从宗师质量判定（标签最可靠）提炼代码规范模式。
4. **P3 · 治/愈（治理中枢 + 认知自愈）**：策略即代码 + 记忆/学习自愈。
5. **P4 · 记忆七层完整实现**：感知缓冲与情景-语义融合为长期工程，前序稳定后展开。

**全局验收门禁**：每个 Phase 必须同时通过 —— ①单元/契约测试（`tests/pillar-contracts/`）；②五维评估（`run-5d-evaluation.sh`）；③五支柱健康巡检（`run-pillar-health.sh`）；④无回归（`tests/regression/`）。任一未过即判定该 Phase 未落地。

---

## 八、与文档体系对齐 & 变更记录

### 8.1 与自建 Agent 标准规范对应（保持 v1.0.0 对齐并增强）

| 标准规范模块 | 本编程体系对应位置 |
| --- | --- |
| 规范契约类（Schema、安全、评测） | `assets/schemas/`（含 memory/judgment schema）、`docs/YYC3-AI-Family-Agent-人机协同/`、`tests/eval-datasets/` |
| Agent 实例描述文件 | 每位家人 `agent.yaml` + `system-prompt.md` + `memory-bindings/` |
| 核心运行时代码 | `03-家人Agent实现集/shared-core/`（含 memory/self-judge/guardrail） |
| 工具体系 | `shared-core/tool-registry/` + 各家人专属工具 |
| 评测体系 | `scripts/run-5d-evaluation.sh` + `scripts/run-pillar-health.sh` + `tests/eval-datasets/` |
| 工程&CI | 根目录配置 + `scripts/` 脚本集 |
| 运维部署 | `ops/`（含五支柱专项 Dashboard） |

### 8.2 与云盘文档目录映射（v2.1.0 起统一归拢至 `docs/`）

| 云盘文档目录 | 编程体系对应位置 |
| --- | --- |
| 人机协同 | `docs/YYC3-AI-Family-Agent-人机协同/` |
| 智能协同架构 | `docs/YYC3-AI-Family-Agent-协同架构/`（设计）＋ `02-智能协同架构内核/`（代码） |
| 家人档案 | `docs/YYC3-AI-Family-Agent-家人档案/`（档案）＋ `03-家人Agent实现集/`（实现，每位家人对应一份档案） |
| （架构总纲） | `docs/YYC3-AI-Family-Agent-架构设计.md`（本文档） |

### 8.3 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v1.0.0 | — | 初始：四大原则 + 目录树 + 家人标准目录 + 共享内核 |
| **v2.0.0** | 2026-10-17 | **五支柱融合**：①新增原则6"五支柱内生"；②定义自·知·学·治·愈内涵与映射；③修复 L1–L3 逻辑断层、C1–C5 技术冲突；④补全 G1–G7 能力缺口（七层记忆/自判断/持续学习/治理/自愈）；⑤补全 NFR（SLO/容错/可观测/演进）；⑥新增 Phase A–E 优先级与验证门禁 |
| v2.0.1 | 2026-10-17 | 建议文档.md 三大支点+外验闭环已并入 v2.0.0，原件归档至 `_archive/建议文档.md` |
| **v2.1.0** | 2026-10-17 | **文档归拢与补全**：①新建 `docs/`，架构设计.md＋三大文档目录＋_archive 统一归拢；②移除顶层 `01-人机协同规范/` 规划，映射更新至 docs/（§4、§8.1、§8.2）；③内核补齐 `03-架构设计文档/`（索引）与 `04-落地规划脚本/`（init-env/migrate-data/canary-release）；④§4 树补录实装 `presets/member-agent/`；⑤新增 §5.7 CAGEERF 七阶段建议稿（Clarify/Analyze/Generate/Evaluate/Execute/Review/Finalize，待权威确权） |
| **v2.2.0** | 2026-10-17 | **工程件与家人骨架补全**：①8 位家人骨架全量实装（business 4/4、core 4/4，经 presets/create-member.sh 生成，元数据取自家人档案：英文名/角色/座右铭/专属热线；品牌色为暂定值待档案确权）；②configs/ 四环境配置落地；③tests/ 六项测试体系骨架落地；④ops/ Docker/K8s/可观测性骨架落地（五高 SLO 规则 + 自评-外验一致率面板）；⑤§4 树标注同步 |
| **v2.2.1** | 2026-10-17 | **Phase A 核心落地**：①新增 `shared-core/memory-framework/procedural-memory/prompt-rule-extractor.ts`（确定性提取器：行为/禁止/工具分类、工作流聚合、稳定 ID、溯源、去重、显著度）；②新增 `tests/unit/procedural-extraction.spec.ts`（15 例，覆盖提取分类/幂等回归/溯源审计/单步不成流/提取→注册→检索闭环，纯 node 可运行，后续迁 vitest）；③本地验证 15/15 通过 |
| **v2.2.2** | 2026-10-17 | **Phase A 全家人初稿产出**：①新增可复用运行器 `scripts/extract-procedural.ts`（幂等、只写 draft、永不触碰确权文件）；②对 8 位家人 system-prompt.md 全量提取，产出 `procedural/rules-draft.yaml` ×8（status: draft，合计 entries=17 / workflows=8，含 provenance 行号溯源与 raw 原文对照）；③确权流程：draft ↔ `intent-rules.yaml`（已确权）对照采纳，人工修订只写后者；④提取器补丁：normalizeStatement 清理前导残留星号；runner 日期取 Asia/Shanghai 本地时区；⑤回归：单测 15/15、YAML 解析 8/8、tsc exit 0 |
| **v2.3.0** | 2026-10-17 | **Phase B 落地：自评-外验闭环实测**（§6.4 第二优先级）：①`verification-gateway` 四组件由桩转实：ground-truth-checker（可插拔真值探针，无源命中不默认成功）、cross-validator（可插拔复核人 + 多数共识聚合）、confidence-calibrator（确定性公式：证实 noisy-OR 上抬 / 驳斥强衰减 selfConf×(1−vConf)）、oracle-registry 维持；②新增闭环门面 `gateway.ts`（VerificationGateway.adjudicate：真值→交叉→合成→校准→指标，外验未证实强制 human-confirm）与 `consistency-metrics.ts`（自评-外验一致率/校准误差/海市蜃楼计数）；③集成测试 `tests/integration/self-judge-verification.spec.ts` 9 例全过：千行意图 11 例 + 宗师质量 3 例实测，门禁实测值 一致率 11/12≈91.7%>90%、校准误差≤0.15、海市蜃楼=1 被拦截转 human-confirm；④Phase A 单测回归 15/15；⑤千行 self-judge 桩位 TODO 更新为闭环对接说明；仓库 tsc exit 0 |
| **v2.4.0** | 2026-10-17 | **Phase C 落地：经验回流首条学习回路**（§6.4 第三优先级，"学"支柱闭环）：①experience-reflow 转实：trajectory-collector（judgment 关联采集 + drain/size）、outcome-labeler（既有逻辑确认：goldenPass 可靠标签/低置信成功→partial）、pattern-extractor（确定性提炼：按 agent·taskType·策略签名聚类，失败反证抑制，成功数≥2 且成功率≥0.8 才成模式，confidence=min(0.95,0.5+0.15×(n−1))×成功率）；②stability-guard 转实：regression-tester（注入式评估器 + previouslyPassed 基线 + 零新增退化门禁）、rollback-controller（委托 SkillVersioner 状态翻转：当前 active→rolled-back、前一版本恢复）、skill-versioner（SemVer 三段递增 + 多版本共存回滚）；③新增闭环门面 `learning-loop.ts`（LearningLoop：ingest→runCycle 批处理；技能库 InMemorySkillStore；回归门禁红线——未验证技能不得 active；每周期固化预算 maxPromotionsPerCycle）；④集成测试 `tests/integration/experience-reflow.spec.ts` 10 例全过（标注/采集/提炼成簇与反证/两周期版本演进/回归失败回滚/预算约束/负样本不学）；⑤三套全量回归 34/34（Phase A 15 + Phase B 9 + Phase C 10）；TODO(infra) 留位：总线桥接、llm-adapter 结构化提炼、procedural-memory 落盘、07-自愈中心回滚委托 |
| **v2.4.1** | 2026-10-17 | **三支柱贯通冒烟实测**（§3.4「自→治→学」协同数据流闭环验证）：①新增 `tests/integration/pillars-smoke.spec.ts`（4 例一次全过）：S1 正向贯通（外验证实轨迹回流→模式→技能 v1.0.0，traceId 三环贯穿 supportingTraces）；S2 海市蜃楼贯通（外验驳斥→human-confirm→学习标签 failure→2成功+1失败反证抑制坏模式固化）；S3 跨周期演进（同簇新证据→同技能 ID minor 升级 v1.1.0，旧版 deprecated）；S4 闭环不变量（被驳斥 traceId 不得进入任何 active 技能溯源；混杂簇 0.75 被抑制、纯净簇正常固化）；②核心原则落地确认：**学习标签取外验结论（goldenPass=effective.verified）而非自评**；③全量回归 38/38（冒烟 4 + Phase A 15 + Phase B 9 + Phase C 10），仓库 tsc exit 0 |
| **v2.5.0** | 2026-10-17 | **Phase D/E 转实 + infra 四集成位闭环**（§6.4 第四/五优先级，「治·愈·知」全链路落地）：①Phase D 治/愈四组件由桩转实：fault-detector（去抖窗口防毛刺：同 layer:type 键窗口计数、回落清零；严重度按超出比率映射 ≥2 critical / ≥1.5 high / ≥1.2 med / 其余 low）、degradation-controller（熔断状态机 closed→open→（冷却）half-open→closed/open 全迁移；bus 层限流 throttle、其余降级 degrade）、consistency-repair（IssueRepairer 注入式快照增量修复，healed/degraded/escalated 三态，RTO 对照 RTO_RPO_TARGETS.memory=300s 记账、RPO=0）、compliance-audit（FNV-1a 链式哈希审计，GENESIS 首环，append/verify 同一哈希原像，篡改任意一条即断链可检）；②Phase E 知识更新三件套转实：semantic-diff（事实格式 subject/attribute/value，归一化确定性差异：同键异值→矛盾 high 可修复 / incoming 包含既有值→取代 med / 一致与新键跳过；输出幂等）、preference-tracker（渐进累积 + 冲突防抖：值变化先 ×0.5（上限 0.5）再按 alpha 累积，历史可回溯 historyOf）、rule-evolution（双门禁 confidence≥0.8 且 supportingTraces≥2 防规则自激；确定性 ruleId=FNV(condition)；minor 版本演进与 skill-versioner 对齐；toWriteRequest 程序记忆写入请求）；③param-adaptation 契约护栏（guardrailVersion=`v1-evaluate-only`：只准入评估、allowed 恒 false、永不执行权重更新；五项放行前提显式声明，回归门禁居首）；④infra 四集成位落地：infra-1 TrajectoryBridge（总线 task.executed→TrajectoryCollector，traceId 注入、坏载荷拒收计数、幂等去重）、infra-2 SemanticAbstractor 端口注入 pattern-extractor（缺省 DeterministicSemanticAbstractor 与 v2.4.0 输出逐字节一致；部署侧接 llm-adapter 结构化输出，同步契约保可回归）、infra-3 FileSkillStore 技能落盘（一技能一文件 JSON、重启恢复、版本共存、损坏文件容错）、infra-4 learning-loop.healingRollback 结构化钩子（05→07 单向解耦）+ RollbackController（learning/infrastructure 分层 RTO 对照 600s/60s 记账，未装配/抛错如实 failed 且 contractMet=false 不谎报愈合）；⑤测试：新增 3 个集成测试 14 例全过（healing-governance 5：去抖/熔断全迁移/一致性修复三态/RTO 记账/审计链防篡改/记忆全链路 commit→retrieve→checkConsistency→forget↔修复联动；knowledge-evolution 5：语义差异幂等/偏好防抖序列 0.3→0.51→0.4785→0.63495/规则门禁与确定性/参数护栏恒拒/学→知闭环 学习模式→演化建议→程序记忆受理；infra-integration 4：桥接/端口注入/落盘 round-trip/回滚钩子与 RTO 记账）；⑥全量回归 **52/52**（Phase A 15 + Phase B 9 + Phase C 10 + 冒烟 4 + infra 4 + 治愈 5 + 知识 5），既有文件（family-bus / qianhang-intent-e2e / pillars.contract / self-judge-kit）exit 0，仓库 tsc exit 0；Phase D 验收「策略即代码覆盖核心链路；记忆 RTO≤5min/RPO=0」与 Phase E 验收「参数级学习不破坏稳定性（护栏 evaluate-only）」达成 |
| **v2.5.1** | 2026-10-17 | **工程闭环三件套：装配指导 / 五支柱 Dashboard / CI 门禁**：①新增 `docs/YYC3-AI-Family-Agent-装配层接线指导.md`（🚨 指导文档，代码未落地后续执行）：infra-1～4 端到端接线分步指南，含 **P0 双采陷阱标注**（TrajectoryCollector.collect 无去重 × LearningLoop.ingest 会采内部 collector → bridge+ingest 同事件双采虚增置信；给出方案 A「增补 signal() 只登记不采集」/方案 B「单入口约定」及取舍）、SkillRollbackPort↔SkillStorePort 适配器代码、HealingRollbackEvent→FaultEvent 翻译、llm-adapter 抽象器确定性红线、装配时序与 A1–A5 冒烟验收清单、执行 checklist（落位 08-系统装配）；②新增 `scripts/run-regression.mjs`（零依赖一体化）：临时目录隔离编译（tsconfig/loader/register 程序化生成）→ 逐 spec 运行 → 解析「结果：N 通过」→ 五支柱（自·知·学·治·愈）聚合 → 生成 `ops/observability/pillar-dashboard/{data.json,index.html}`（自包含面板 file:// 直开）→ 门禁 exit code；`package.json` 固化 `pnpm regression`；③`ops/observability/prometheus-rules.yaml` 追加回归门禁组（RegressionGateFailed / FivePillarDashboardRed 告警占位，YAML 解析实证通过）；④新增 `.github/workflows/regression-gate.yml`（pnpm install → typecheck → regression → 面板 artifact 上传）；⑤实测：门禁 52/52 全绿（自 13 / 知 25 / 学 23 / 治 18 / 愈 9，跨支柱计数），失败路径实测 exit 1 拦截；修复 node:module resolve 钩子两处 URL/字符串类型契约（register 接受 URL、nextResolve 需字符串 href） |
| **v2.6.0** | 2026-10-17 | **装配层接线闭环（infra-1～4 端到端）**：按 v2.5.1《装配层接线指导》执行落地：①learning-loop 增补 `signal(traceId, goldenPass)`（指导方案 A，只登记不采集）——事件唯一入口=TrajectoryBridge（总线→collector）、标签唯一入口=loop.signal（网关裁定），从根上消除 ingest 双采；②新增 `08-系统装配/runtime-assembly.ts` 装配门面（内核编号顺延）：`createRuntimeAssembly(options)` 按序装配 store→healingRollback→loop→bridge→attach(bus)，返回 `{bus, bridge, loop, store, rollbackController}`；含两个关键适配点：`skillRollbackAdapter`（SkillStorePort→SkillRollbackPort，SkillVersioner 状态翻转即落盘）、`HealingRollbackEvent→FaultEvent` 翻译（learning 层 severity=high，RTO 契约 600s）；依赖方向约束落实：05↛07，装配层是唯一同时知道两者的模块；③新增 `tests/integration/assembly-e2e.spec.ts` 五例一次全过：A1 总线发布→桥接受理→collector 采集、A2 轨迹+signal→固化→FileSkillStore 落盘 active v1.0.0（traceId 三环贯穿 supportingTraces=3）、A3 必败评估→门禁回滚→钩子委托 RollbackController（healed+contractMet+RTO≤600s）+落盘状态翻转 rolled-back（无前置版本 activeSkills=0 红线）、A4 坏载荷拒收计数不抛错、A5 同幂等键重复发布总线去重；④`.gitignore` 追加 `data/`（运行时技能库不入库）；⑤回归脚本清单纳入装配 spec，`pnpm regression` 门禁 **57/57 全绿**（自 13 / 知 25 / 学 28 / 治 18 / 愈 14），根 tsc exit 0，五支柱 Dashboard 同步刷新 |
| **v2.7.0** | 2026-10-17 | **P0 可观测数据面打通（指标产出 → /metrics → Prometheus → 告警消费）**：①新增 `09-可观测性`（内核编号顺延）：`metrics-registry.ts` 零依赖 Counter/Gauge/Histogram + Prometheus 文本 exposition（标签字典序、累积分桶 `_bucket{le}`、`_sum`/`_count`，不引入 prom-client）；`family-metrics.ts` 定义 14 项 `family_*` 指标并封装 recordBridgeEvent / recordCycle / recordHealing / recordCircuitState / recordConsistency / observeMemoryRetrieval；`metrics-server.ts` 零依赖 node:http 暴露 `GET /metrics`（text/plain; version=0.0.4）与 `/healthz`（端口 0 = 系统随机分配）；②最小侵入埋点：TrajectoryBridge 增可选 `onEvent` 观察者（受理/拒收）、LearningLoop 增 `onCycle` 周期钩子（只读观测不改学习决策）、`instrumentMemoryOrchestrator` 以 Proxy 装饰器对 retrieve 计时（MemoryOrchestratorImpl 零改动）；③装配层 `createRuntimeAssembly({ metrics })` 一次接线桥接 / 学习周期 / 自愈记账，句柄回传 metrics；④告警规则 7 条全部接真实指标：HighPerfP99Latency→`family_task_execution_duration_seconds_bucket`、HighAvailabilityErrorRate→`family_task_executed_total{outcome}`（clamp_min 防 0/0）、SelfJudgeCalibrationDrift→`family_selfjudge_agreement_ratio`、MemoryRetrievalSlow→`family_memory_retrieval_duration_seconds_bucket`（P95>300ms）、LearningRegressionFailure→`family_learning_regression_failed_cases`；CI 两条由 `run-regression.mjs` 生成 `metrics.prom`（`family_regression_gate_failed_total` / `family_pillar_failed_cases{pillar=self\|memory\|learning\|governance\|healing}`）；⑤新增 `tests/integration/metrics-observability.spec.ts` 6 例全过（文本格式 / 桥接 / 周期 / 自愈 / 记忆计时 / HTTP 端点）；全量门禁 **63/63 全绿**（自 13 / 知 25 / 学 34 / 治 18 / 愈 20），根 tsc exit 0；⑥至此故障侦测多源信号、全局态势中心、Grafana 大屏与告警规则均具备真实数据源，P0 空转缺口闭合 |
| **v2.7.1** | 2026-10-23 | **P0 验收放行条件闭环（L1/L2/L3/L6）**：①L1+L6 新增 `08-系统装配/runtime-entry.ts` 进程级入口：`startRuntime` 创建 FamilyMetrics → 装配五支柱 → 启动 `/metrics` → 一致性快照首报 + 定时上报（默认 15s，定时器 unref 不阻止退出），`stop()` 幂等；`startRuntimeFromEnv` 支持 `YYC3_SKILL_STORE_DIR / YYC3_METRICS_PORT / YYC3_METRICS_HOST / YYC3_METRICS_TOKEN / YYC3_CONSISTENCY_INTERVAL_MS`；②L3 `metrics-server` 加固：默认绑定 `127.0.0.1`（原 0.0.0.0），新增可选 `authToken` —— `/metrics` 走 Bearer 鉴权（`timingSafeEqual` 常量时间 + 长度短路），`/healthz` 免鉴权供存活探针；③L2 CI 指标通路：新增 `ops/observability/prometheus.yml`（runtime 抓取带 `bearer_token_file` / Pushgateway `honor_labels` / Prometheus 自身三作业 + `rule_files`）、`scripts/push-metrics.mjs`（零依赖 fetch 推送，未配置 `PUSHGATEWAY_URL` 时跳过且 exit 0）、CI 步骤按 `secrets.PUSHGATEWAY_URL` 条件执行；④测试：metrics-observability 新增 M7（401/401/200 + healthz 免鉴权）与 M8（入口首报一致性、总线事件入指标、幂等停止后连接失败），8/8 全过；⑤全量门禁 **65/65 全绿**（自 13 / 知 25 / 学 36 / 治 18 / 愈 22），根 tsc exit 0；Pushgateway 推送实测 19 条样本；⑥验收结论由「有条件通过」升级「**通过（无条件）**」，报告 v1.1.0 新增 §十一 闭环实证，剩余 L4/L5/L7/L8 为改进项 |
| **v2.7.2** | 2026-10-23 | **验收改进项 L4/L5 闭环**：①L5 降级控制器纳入装配：`DegradationOptions.onStateChange` 状态迁移回调（仅真实变化时触发）；`createRuntimeAssembly` 新增 `faultDetector` / `degradation` 选项与 `handleSignal(signal)` 一条调用完成「信号 → 去抖侦测 → 降级/熔断 → 指标记账」，初始 `closed` 态主动上报（修复无样本盲区）；`RuntimeAssembly` 暴露 `faultDetector` / `degradation`；②L4 静默 spec 清零（4 个全部产出汇总行）：`self-judge-kit` 转 3 例真实断言（低置信升级 / 校准误差门禁 / 检索 400ms 落 0.5 桶）；`family-bus` 转 4 例真实断言（发布订阅 traceId / 幂等去重 / 幂等粒度 seq / 点对点路由）+ 1 例显式跳过（DLQ 未实现）；`pillars.contract` 5 条契约由恒真占位改为真实校验（自：低置信升级；知：写入→检索 traceId 贯通；学：零退化放行且退化拦截；治：审计链可验真且篡改断链；愈：回滚 healed + RTO 契约达成）；`qianhang-intent-e2e` 4 步显式跳过并注明原因（IntentGatewayService.handle 仍为骨架，待 P1 llm-adapter）；③回归脚本支持跳过语义：解析「N 通过 / M 失败 / S 跳过 / 共 K 例」、面板与 data.json 展示跳过数、门禁仍以「exit 0 且零失败」判定；④全量门禁 **78/78 全绿**（自 16 / 知 25 / 学 37 / 治 18 / 愈 23），显式跳过 5 例，静默 spec **归零**，根 tsc exit 0 |
| **v2.7.3** | 2026-10-23 | **接线边界治理：未接线模块清单 + 仓库基线**：①新增 `docs/YYC3-AI-Family-Agent-未接线模块清单.md`：以 13 个门禁入口做静态 import 可达性分析（241 编译文件 / **80 已接线** / 161 仅编译），逐目录登记状态（✅已接线 / ◐仅编译 / ⬜骨架 / ⚠配置未加载 / ⊘未纳入门禁）；核心结论：`01-九层底座` 0/20、`06-治理中心` 2/11、`03` 8 位家人仅 2 个 `self-judge` 被引用（102/104 未接线）、8 个家人自测 spec 被 tsconfig 排除且不在门禁清单、40 个 YAML/MD 配置无加载器；②清单内置「标准与规范五维矩阵」：YYC³ 协同开发文档、ISO/IEC/IEEE 42010、ISO/IEC 25010、SemVer 2.0.0、Keep a Changelog 1.1.0、Conventional Commits 1.0.0、RFC 2119/8174、Prometheus exposition 0.0.4、OpenMetrics 1.0（规划）、W3C Trace Context、SRE RTO/RPO、OWASP ASVS 4.0.3、SPDX MIT、Node LTS 策略，逐项标注时间/空间/属性/事件/关联维度与状态；③治理规则：新增骨架必须登记、接线完成必须移除、删除前先清 barrel、家人测试必须迁入 `tests/` 并改写零依赖 harness、每个 MINOR 发布前复核统计；④README 增「模块接线状态」段并链接清单；CONTRIBUTING PR 自检新增清单同步项；⑤仓库基线：`git init -b main` + 单次基线提交（405 文件 / 32,229 行），`docs/02-*`、`docs/03-*` 本地备份加入 `.gitignore` 不入远端 |
| **v2.8.0** | 2026-10-23 | **L7 落地：Histogram Exemplars（OpenMetrics 下钻）**：①`09-可观测性/metrics-registry` 新增 `ExemplarOptions` / `Exemplar`：`Histogram.observe(value, labels, exemplar?)`、落点桶定位（超出上界归 +Inf 桶）、每桶上限（默认 1，保留最新）、TTL 惰性清理、`onDrop` 回调；新增 `MetricsRegistry.renderOpenMetrics()`（OpenMetrics 1.0，`# EOF` 收尾）；②`metrics-server` 按 `Accept` 协商：`application/openmetrics-text` → 1.0，否则维持 `text/plain; version=0.0.4`；③`family-metrics` 新增 `FamilyMetricsOptions.exemplars`：仅在启用时注册 `family_exemplars_dropped_total`，`observeMemoryRetrieval(ms, traceId?)` 与任务时长携带 `trace_id`，记忆检索装饰器从 `ctx.traceId` 提取；④`runtime-entry` 增 `exemplars` 选项与 `YYC3_EXEMPLARS_ENABLED=1` 环境开关；⑤`prometheus.yml` runtime 作业增 `scrape_protocols: [OpenMetricsText1.0.0, PrometheusText0.0.4]`；Grafana 新增记忆 P95 / 任务 P99 面板并启用 `exemplar: true`；⑥测试新增 M9（默认关闭零变化）/ M10（落点桶 + trace_id）/ M10b（上限+丢弃+TTL）/ M10c（协议协商），metrics-observability 12/12；全量门禁 **82/82 全绿**（自 16 / 知 25 / 学 41 / 治 18 / 愈 27），显式跳过 5 例，根 tsc exit 0；默认关闭时 `/metrics` 无 exemplar 行、无丢弃指标，CI `metrics.prom` 仅用例计数 8→12 |
| **v2.9.0** | 2026-10-23 | **P1 智谱 Provider 接入（真实 HTTP）**：①新增 `03-家人Agent实现集/shared-core/llm-adapter`：`types.ts`（`ChatMessage` / `CompletionRequest` / `CompletionResponse` / `ProviderError`）与 `zhipu-provider.ts`——智谱开放平台 v4 `POST {baseUrl}/chat/completions`，支持标准补全、SSE 流式（`text/event-stream`，`[DONE]` 终止）、`AbortController` 超时（默认 30s）、429/5xx 指数退避（默认 2 次重试，基数 300ms）、错误分类（status + retryable）；②安全：密钥仅从 `ZHIPU_API_KEY` 读取，不落盘、不打印、错误信息不回显密钥；③8 位家人的 `providers/zhipu.provider.ts` 统一改为薄转发（`export { ZhiPuProvider } from '@shared/llm-adapter/zhipu-provider.js'`），消除 8 份重复骨架；④测试新增 `tests/integration/llm-provider.spec.ts` 6 例（补全请求形状 / 500→500→200 重试 / 401 不重试且不回显密钥 / 超时 / SSE 增量拼接 / isAvailable），全量门禁 **88/88 全绿**（自 16 / 知 25 / 学 47 / 治 18 / 愈 27），显式跳过 5 例，根 tsc exit 0；⑤P1 剩余：OpenAI provider（同协议适配）与千行意图链路接线 |
| **v2.10.0** | 2026-10-23 | **OpenAI Provider + 兼容客户端抽象**：①新增 `shared-core/llm-adapter/openai-compatible-client.ts`——把传输、超时（AbortController）、429/5xx 指数退避、SSE 解析、错误分类与密钥脱敏收敛为共享基类；`payload()` 可被子类覆盖以追加供应商字段；②新增 `openai-provider.ts`：OpenAI v1 `/chat/completions`，默认 `OPENAI_API_KEY`，支持可选 `OpenAI-Organization` / `OpenAI-Project` 头；③`zhipu-provider.ts` 改为基类薄配置（默认 `ZHIPU_API_KEY` + 智谱 v4 baseUrl），行为与测试保持不变；④8 位家人的 `providers/openai.provider.ts` 统一为薄转发，消除重复类型与骨架；⑤测试新增 O1（请求形状 / 组织头 / 响应整形）与 O2（`OPENAI_API_KEY` 与 `ZHIPU_API_KEY` 隔离），llm-provider 8/8；全量门禁 **90/90 全绿**（自 16 / 知 25 / 学 49 / 治 18 / 愈 27），显式跳过 5 例，根 tsc exit 0；⑥P1 剩余：千行意图链路接线（classifier + gateway） |
| **v2.11.0** | 2026-10-23 | **P1 收尾：千行意图链路实装**：①`member-qianhang/core/intent-classifier` 规则扩展（整理/待办/清单/安排/提醒/开销/数据/查一下/草稿/哪个好/预估）并将评分改为「命中即 0.6 起、多命中递增」，避免长关键词表稀释置信度；②`intent-gateway` 分类 → 路由（010301-02 万物 / 03 先知 / 04 伯乐 / 05 天枢 / 06 宗师 / 08 灵韵 / 01 千行）实际打通；③`TaskDecomposer` 由骨架转实：CAGEERF 七阶段绑定 owner（clarify→千行 / analyze→万物 / generate·execute→天枢 / evaluate·review→宗师 / finalize→伯乐）、线性 `dependsOn`、goal 携带原始话语；④`tests/e2e/qianhang-intent-e2e.spec.ts` 由 4 例跳过改为**真实断言**（E1 上下文写入 / E2 intent=analysis + confidence≥0.6 + escalation=none + routeTo=010301-02 / E3 7 阶段 + owner 正则 + 依赖链 + traceId / E4 成就 100 解锁、99 未解锁）；⑤全量门禁 **94/94 全绿**（自 20 / 知 25 / 学 53 / 治 18 / 愈 27），**显式跳过降至 1 例**（仅 EventBus DLQ），静默 0，根 tsc exit 0；⑥P1 完成：双 provider + 意图链路闭环 |

---

> 「***YanYuCloudCube***」
> 「***<admin@0379.email>***」
> 「***Words Initiate Quadrants, Language Serves as Core for the Future***」
> 「***All things converge in cloud pivot; Deep stacks ignite a new era of intelligence***」

**© 2025-2026 YanYuCloudCube™. All Rights Reserved.**
