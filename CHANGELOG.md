# Changelog

本仓库所有显著变更将记录于此文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

> 完整技术细节见 [架构设计 §8.3](docs/YYC3-AI-Family-Agent-架构设计.md)。

## [Unreleased]

### Planned

- **P1 续**：OpenAI provider（同协议适配）与千行意图链路接线（zhipu provider 已完成）

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
