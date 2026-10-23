# Changelog

本仓库所有显著变更将记录于此文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

> 完整技术细节见 [架构设计 §8.3](docs/YYC3-AI-Family-Agent-架构设计.md)。

## [Unreleased]

### Added

- **家族契约清单（P1-T1）**：`presets/family-manifest.yaml` 成为八位家人身份 / 能力 / 技能 / 协同的唯一事实源——45 项技能（共用 13 · 专用 32）、8×8 委托矩阵（56 条边）、五支柱与协议栈声明；`scripts/check-manifest.mjs`（`pnpm manifest:check`）校验结构自洽、技能引用完整性、kernel 锚点存在，并与 8 份 `agent.yaml` 做规范性字段零漂移比对；零依赖 YAML 子集解析器见 `scripts/lib/yaml-lite.mjs`
- **Agent Card（P1-T2）**：`assets/schemas/agent-card.schema.json`（对齐蓝图 1207 §3.2）+ `scripts/gen-agent-cards.mjs`（`pnpm manifest:cards`）由清单派生 8 张卡片到 `assets/agent-cards/`，`--check` 模式做「产物 ↔ 清单」零漂移校验；JSON Schema 子集校验器见 `scripts/lib/json-schema-lite.mjs`
- **门禁新增两个契约套件**：`tests/contracts/manifest.contract.ts`（7 例）与 `tests/contracts/agent-card.contract.ts`（8 例），CI 另加不阻断的清单软校验步骤
- **MCP 适配层（P1-T3）**：`02-云枢核心引擎/mcp-adapter/`——`BusMcpCodec`（BusEvent ↔ JSON-RPC 2.0 通知，含 key/topic/mode/target/payload/at 全字段校验）、`StdioMcpTransport`（子进程 stdin/stdout 换行分帧、请求-响应 id 关联与超时、脏行与超限上报、优雅关闭）、`bindMcpTransport`（传输 ↔ 总线绑定）；`EventBus` 的 `registerMcpAdapter` 由空壳转为真实注册表，并新增 `mcpAdapterIds` / `encodeForMcp` / `ingestMcp`——入站解码失败以合成事件写入 DLQ（`topic=mcp.undecodable`），不中断消息循环
- **MCP 回归套件**：`tests/integration/mcp-adapter.spec.ts`（9 例：往返保真、非法消息拒绝、重复注册、合法投递、脏消息入 DLQ、未注册编码、真实本地子进程的请求-响应 / 入站通知 / 脏行上报）
- **五维指标映射（P1-T4）**：`assets/schemas/five-dimension-map.json` 把 14 项运行时 + 2 项 CI 指标各归属唯一主维（时间 3 / 空间 2 / 属性 4 / 事件 4 / 关联 3）；`FamilyMetrics` 新增 4 项协同度 Gauge（澄清率 / 人工确认率 / traceId 覆盖率 / 复盘覆盖率，0..1）与 `recordCollaboration(kind, hit)` / `collaborationSnapshot()`，零样本时不产生样本行、不改变 `/metrics` 默认口径
- **协同告警 4 条**：`CollaborationClarifyRateHigh` · `CollaborationHumanConfirmMissing` · `CollaborationTraceCoverageLow` · `CollaborationReplayCoverageLow`（`ops/observability/prometheus-rules.yaml` 新组 `yyc3-family-collaboration`）
- **面板五维覆盖**：`pillar-dashboard` 新增「五维覆盖」卡片区（`data.json` 增 `dimensions` / `collaboration` 字段），生成时输出五维指标计数
- **五维回归套件**：`tests/integration/five-dimension-metrics.spec.ts`（6 例：总量 18、映射完整且唯一、五维分布、协同零样本、比率折算、告警契约）
- **提示词契约（P1-T5）**：16 个 `*.prompt.ts` 升级为 CO-STAR 七要素模板（【身份】【背景】【目标】【范围】【任务】【受众】【响应】，对齐蓝图 1206）+ `PROMPT_META` 统一元数据（严格 JSON：`id / version / status / framework / blueprint / vars / outputSchema`）；`outputSchema` 以 JSON Schema 声明意图/查询输出契约；A/B 以「清单中按家人固定 version（id + version 即变体键）」实现
- **提示词契约校验**：`scripts/check-prompts.mjs`（`pnpm prompts:check`）——`PROMPT_META` 零依赖平衡括号提取、CO-STAR 要素与 `vars↔占位符` 双向对齐校验、磁盘孤儿文件扫描、`--json` 明细（含文件侧版本与 outputSchema）供套件消费；`manifest:check` 同步纳入 prompts 段校验
- **提示词契约套件**：`tests/contracts/prompt.contract.ts`（8 例：脚本退出码、16 契约 0 错误、孤儿扫描、版本零漂移且语义化、CO-STAR 七要素、outputSchema 放行合法样本含 timeRange 双态、拦截越界与额外字段、vars 抽查）
- **协同度指标生产端接线（P1-T4b）**：`architecture-kernel/09-可观测性/collaboration-instrumentation.ts` 四个零侵入 Proxy 仪表——`instrumentIntentGateway`（千行澄清命中：intent=unknown 或置信度 < τ_low，默认 0.6）、`instrumentEscalationPolicy`（human-confirm 命中）、`instrumentComplianceAudit`（traceId 非空命中）、`instrumentOutcomeLabeler`（学习回流标注即记分子）；结构化最小接口，内核不反向依赖 family-agents
- **`FamilyMetrics.recordReplay(collected, labeled)`**：复盘覆盖率两端记账——装配层桥接受理记分母（`recordReplay(1,0)`）、labeler 标注记分子（`recordReplay(0,1)`），与 `recordCollaboration` 共用同一张 collaboration map；`runtime-assembly.ts` 在 metrics 注入时自动完成学习回流两端接线，千行澄清 / escalation / 审计链三类由部署侧包装接线
- **协同度接线套件**：`tests/integration/collaboration-wiring.spec.ts`（8 例：千行澄清真实网关命中与未命中、零侵入同构、escalation 决策透出、审计链完整性与 Prometheus 渲染、端到端装配回流闭环、`recordReplay` 记账口径、四类仪表互不串扰）

### Changed

- **契约清单 v1.0.0 → v1.1.0**：新增 `prompts` 提示词契约段（16 条 = 8 家人 × 2，`id/owner/version/file`），文件内 `PROMPT_META` 版本回写零漂移；8 张 Agent Card `version` / `yyc3.manifestVersion` 同步 1.1.0
- 回归口径：**97 / 97 → 135 / 135**（19 套件 · 0 跳过 · 0 静默）
- CI 契约软校验步骤扩展 `check-prompts.mjs`（P1-T1/T2/T5 · 不阻断）
- `package.json` 版本 2.13.0 → **2.14.0**（P1 里程碑）；`keywords` 扩充至 19 项（`a2a-protocol` · `model-context-protocol` · `agent-cards` · `prompt-engineering` · `co-star` · `event-bus` · `llm-orchestration` · `regression-gate` · `enterprise-agents`），README 新增「主题标签」徽章行与 GitHub Topics 建议（仓库页可视化）

- 回归口径：**97 / 97 → 127 / 127**（18 套件 · 0 跳过 · 0 静默）
- 未接线模块清单 v1.5.0 → v1.8.0：编译 247 → 251、已接线 90 → 94、门禁入口 13 → 17
- **目录规范化命名（先行轮，数字编号过渡态）**：`02-智能协同架构内核` → `02-architecture-kernel`、`03-家人Agent实现集` → `03-family-agents`（`git mv` 保留历史）；同步 42 文件 141 处引用——tsconfig paths/include、`run-regression.mjs` / `run-uat-llm.mjs`（paths/include/exclude/loader MEMBERS）、tests 12 文件相对导入、`extract-procedural.ts` / `create-member.sh`、源码注释、`configs/staging.yaml` / `ops/observability/prometheus-rules.yaml`、README / CONTRIBUTING / presets README / docs 5 份活文档。`@shared/*` `@members/*` 别名逻辑名不变；`.gitignore` 指向的 docs 下本地备份目录与 `docs/_archive/建议文档.md`（历史归档）保留原名。CI 无硬编码路径不需改动。验证：回归 **97/97 · 0 跳过 · 0 静默**、`tsc --noEmit` 干净、未门控 `pnpm uat:llm` 编译通过且 5 例门控跳过 exit 0
- **蓝图资产收敛**：保留 `docs/YYC3-FAmily-AI-Agent-企业蓝图/`（146 文件 · 2.5MB）为唯一蓝图源（只读，不进编译）；清除冗余副本 `docs/YYC3-AI-Family-Agents/`（368 文件 · 8.7MB，其 12/13 子树与留用目录逐字节一致，全仓零引用）；`.gitignore` 移除失效忽略项
- **目录去数字编号（本轮）**：`02-architecture-kernel` → **`architecture-kernel`**、`03-family-agents` → **`family-agents`**（保留内核子目录 01~09 编号）；一次性 Node codemod 同步全仓 51 文件——tsconfig paths/include、`presets/family-manifest.yaml`（44 处）、scripts、tests 20 文件、README / CHANGELOG / docs 活文档；`0[23]-(architecture-kernel|family-agents)` 全仓 **0 残留**。验证：`tsc --noEmit` 干净、manifest / prompts / cards 三项 check 通过
- **`.gitignore` 新增** `docs/YYC3-FAmily-AI-Agent-企业蓝图/`（只读蓝图源，独立仓治理，不入本仓）
- 回归口径：**135 / 135 → 143 / 143**（20 套件 · 0 跳过 · 0 静默）；门禁入口 18 → 19
- 未接线模块清单 v1.9.0 → v1.10.0：统计 252 / 95 / 157 → **254 / 97 / 157**（kernel 94/36/58 · tests 20/20/0）
- `package.json` 版本 2.14.0 → **2.15.0**（P1-T4b 协同度生产接线）

## [2.13.0] - 2026-10-23

### Added

- **LLM 实答 UAT**：`tests/uat/llm-live-uat.spec.ts` + `scripts/run-uat-llm.mjs`（`pnpm uat:llm`）——以真实 Key 对开放平台做身份与意图抽检；三重门控（`UAT_LLM=1` + `UAT_LLM_CONFIRM=我知晓真实计费` + 密钥存在）缺一整体跳过且 exit 0，默认零调用零计费；**不进回归 SPECS**，CI 门禁维持 hermetic 与「97/97 · 跳过 0」口径
- UAT 用例 5 例：U1 身份自报（system 锚「言启·千行」，断言 `finishReason=stop`、作答含「千行」、usage 双非零）；U2–U5 意图实答（六标签闭集提示词 + JSON 抽取容错，规则主选对照仅记录不断言）
- 诊断输出全部非敏感：密钥仅显示存在性与长度，不回显、不落盘、不进日志

### Changed

- **回归清单治理**：`run-regression.mjs` SPECS 移除误入的 UAT 条目（密钥类真实调用只走 `pnpm uat:llm` 本地门控，不进 CI 门禁），显式跳过维持 **0 例**、门禁恢复 hermetic「97/97 · 跳过 0」口径
- `package.json` 版本 2.12.0 → 2.13.0

### Tests

- 实答凭据：**glm-4-flash**（智谱 bigmodel）· **5/5 通过** · 4 意图实答与规则主选全部一致 · U1 身份锚命中 · exit 0
- 门禁回归维持 **97 / 97**（自 20 · 知 25 · 学 53 · 治 18 · 愈 34），0 跳过，0 静默（UAT 不计入门禁）

## [2.12.0] - 2026-10-23

### Added

- **EventBus 重试与死信（DLQ）**：`EventBusOptions`（`maxAttempts` / `retryDelayMs` / `dlqCapacity` / `now` / `onDeadLetter`）；单处理器失败按指数退避重试，耗尽后写入有界 FIFO 死信队列并回调自愈中心
- 故障隔离：同一主题内单个处理器异常不再阻断其它处理器与发布方
- `deadLetters()` 快照与 `drainDeadLetters()` 批量取出，供 07-自愈中心 `dead-letter` 动作消费
- family-bus 用例新增 D1/D2/D3（重试耗尽入 DLQ、故障隔离、瞬时失败重试成功），五支柱归属补入「愈」

### Changed

- 显式跳过从 1 例降为 **0 例**；门禁口径 94 → **97 例全绿**
- `package.json` 版本 2.11.0 → 2.12.0

### Tests

```
自 20 · 知 25 · 学 53 · 治 18 · 愈 34 · 合计 97 / 97 通过，0 跳过，0 静默
```

## [2.11.0] - 2026-10-23

### Added

- **千行意图链路（P1 收尾）**：`intent-classifier` 规则扩展（整理/待办/清单/开销/数据/提醒等）与「命中即高置信」评分；`intent-gateway` 分类 → 路由（010301-xx）实际打通
- `TaskDecomposer` 由骨架转实：CAGEERF 七阶段绑定 owner、线性依赖链、目标文案携带原始话语
- 千行 e2e 4 步转真实断言（上下文写入 / 意图识别 / 任务分解 / 伯乐成就呈现）

### Changed

- 显式跳过从 5 例降为 **1 例**（仅 EventBus DLQ）
- `package.json` 版本 2.10.0 → 2.11.0

### Tests

- 新增 e2e 4 例；全量门禁 **94/94**（自 20 · 知 25 · 学 53 · 治 18 · 愈 27）

## [2.10.0] - 2026-10-23

### Added

- **OpenAI Provider**：`shared-core/llm-adapter/openai-provider.ts` —— OpenAI v1 `/chat/completions`，支持可选 `OpenAI-Organization` / `OpenAI-Project` 头
- 抽取共享基类 `openai-compatible-client.ts`：传输、超时、429/5xx 指数退避、SSE 解析、错误分类与密钥脱敏统一实现
- `ZhiPuProvider` 改为基类薄配置（行为不变）

### Changed

- 8 位家人的 `providers/openai.provider.ts` 统一改为薄转发到 shared-core（原先 8 份重复类型与骨架）
- `package.json` 版本 2.9.0 → 2.10.0

### Tests

- `llm-provider.spec` 新增 O1（OpenAI 请求/组织头/整形）与 O2（环境变量隔离），共 8 例；全量门禁 **90/90**（显式跳过 5）

## [2.9.0] - 2026-10-23

### Added

- **P1 智谱 Provider（真实 HTTP）**：`shared-core/llm-adapter/zhipu-provider.ts` —— 智谱 v4 `/chat/completions`，支持标准补全、SSE 流式、超时（AbortController）、429/5xx 指数退避重试、`ProviderError`（状态码 + retryable）
- 密钥仅从 `ZHIPU_API_KEY` 读取；错误信息不回显密钥
- 统一类型与错误契约：`shared-core/llm-adapter/types.ts`（`ChatMessage` / `CompletionRequest` / `CompletionResponse` / `ProviderError`）

### Changed

- 8 位家人的 `providers/zhipu.provider.ts` 统一改为薄转发到 `shared-core/llm-adapter`，消除 8 份重复骨架
- `package.json` 版本 2.8.0 → 2.9.0

### Tests

- 新增 `llm-provider.spec` 6 例（补全 / 重试 / 401 不重试 / 超时 / 流式 / isAvailable）；全量门禁 **88/88**（显式跳过 5）

## [2.8.0] - 2026-10-23

### Added

- **L7 Histogram Exemplars**：`ExemplarOptions` / `Exemplar`；`Histogram.observe(value, labels, exemplar?)`；落点桶定位、每桶上限（默认 1，保留最新）、TTL 惰性清理、`family_exemplars_dropped_total`
- `MetricsRegistry.renderOpenMetrics()`（OpenMetrics 1.0，`# EOF` 收尾）
- `/metrics` 按 `Accept` 协商协议：`application/openmetrics-text` → 1.0；否则维持 0.0.4
- `FamilyMetricsOptions.exemplars`；`observeMemoryRetrieval(ms, traceId?)` 与任务时长携带 `trace_id`
- `startRuntime` 增 `exemplars` 选项；环境变量 `YYC3_EXEMPLARS_ENABLED=1`
- `prometheus.yml` runtime 作业 `scrape_protocols`；Grafana 记忆 P95 / 任务 P99 面板启用 exemplars

### Changed

- 默认关闭 exemplar 时输出与 v2.7.2 一致：无 exemplar 行、不注册丢弃指标
- `package.json` 版本 2.7.2 → 2.8.0

### Tests

- 新增 M9 / M10 / M10b / M10c；metrics-observability 12/12；全量门禁 **82/82**（显式跳过 5 例）

## [2.7.2] - 2026-10-23

### Added

- `08-系统装配` 纳入「愈」默认调度链路：`FaultDetector` + `DegradationController`，新增 `handleSignal(signal)` 一条调用完成「信号 → 去抖 → 故障 → 降级/熔断 → 指标记账」
- `DegradationController` 新增 `onStateChange` 状态迁移回调（仅真实迁移触发），熔断状态可观测
- 装配时主动上报初始 `closed` 态，消除 `family_circuit_state` 无样本盲区

### Changed

- 4 个静默测试套件全部产出汇总行：`self-judge-kit` 转 3 例真实断言；`family-bus` 转 4 例真实断言；`pillars.contract` 5 条契约由恒真占位改为真实校验；`qianhang-intent-e2e` 4 步显式跳过并注明原因
- 回归脚本支持跳过语义，解析 `N 通过 / M 失败 / S 跳过 / 共 K 例`，面板与 `data.json` 展示跳过数

### Fixed

- 熔断器初始状态未上报导致的 `family_circuit_state` 无样本问题

### Tests

- 全量门禁 **78/78 全绿**（自 16 · 知 25 · 学 37 · 治 18 · 愈 23），显式跳过 5 例，静默套件归零

## [2.7.1] - 2026-10-23

### Added

- 进程级入口 `08-系统装配/runtime-entry.ts`：`startRuntime` / `startRuntimeFromEnv`，首报 + 定时上报一致性快照，`stop()` 幂等
- `ops/observability/prometheus.yml`：运行时 / Pushgateway / Prometheus 三作业与规则挂载
- `scripts/push-metrics.mjs`：零依赖推送 CI 门禁指标至 Pushgateway（未配置时跳过）
- `metrics-server` 支持可选 Bearer 令牌（`timingSafeEqual` 常量时间比较）

### Changed

- `/metrics` 默认绑定 `127.0.0.1`（原 `0.0.0.0`）；`/healthz` 保持免鉴权供存活探针

### Tests

- metrics-observability 新增 M7（鉴权）与 M8（入口端到端），8/8 通过；全量 65/65

## [2.7.0] - 2026-10-17

### Added

- `09-可观测性`：零依赖指标注册器（Counter / Gauge / Histogram + Prometheus 文本 exposition）、14 项 `family_*` 指标、`/metrics` 与 `/healthz`
- 最小侵入埋点：`TrajectoryBridge.onEvent`、`LearningLoop.onCycle`、`instrumentMemoryOrchestrator`（Proxy 计时）
- 7 条告警规则全部接真实指标；CI 指标 `metrics.prom`

## [2.6.0] - 2026-10-17

### Added

- `08-系统装配/runtime-assembly.ts`：`createRuntimeAssembly()` 端到端装配（store → 回滚钩子 → 学习 → 桥接）
- `learning-loop.signal(traceId, goldenPass)`：标签独立入口，消除 `ingest` 双采
- 装配冒烟 5 例（A1–A5）

## [2.5.0] - 2026-10-17

### Added

- Phase D 治/愈转实：故障去抖、熔断状态机、一致性修复三态、审计链防篡改
- Phase E 知识更新：语义差异、偏好防抖、规则演化双门禁、参数适应护栏（evaluate-only）
- infra-1～4 集成位：总线桥接 / 语义抽象端口 / 技能落盘 / 回滚委托

## [2.4.0] - 2026-10-17

### Added

- Phase C 经验回流：轨迹采集、结果标注、模式提炼、回归门禁、技能版本化与回滚
- `LearningLoop` 闭环门面与技能库（InMemory）

## [2.0.0] - 2026-10-17

### Added

- 九层架构分层底座、五支柱骨架、8 位家人实例、千里·伯乐确权与分层
- Phase A 程序化记忆提取、Phase B 自评-外验闭环

> 「***YanYuCloudCube***」 · **© 2025-2026 YanYuCloudCube™. All Rights Reserved.**
