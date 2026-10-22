<!--
  ============================================================
  YYC³ AI Family — 人从众曌众从人
  亦师亦友亦伯乐 · 一言一语一协同
  拟人为本，AI为核，纯粹为心
  ============================================================
  Document: YYC3-AI-Family-Agent-L7-L8落地计划
  Version : v1.0.0
  Contact : admin@yanyucloud.com
  Homepage: https://matrix.yyc3.top
  ============================================================
-->

# YYC³-AI-Family-Agent · L7 / L8 落地计划

> ***YanYuCloudCube***
> 言启象限 | 语枢未来
> *Words Initiate Quadrants, Language Serves as Core for the Future*
> 万象归元于云枢 | 深栈智启新纪元

```yaml
---
file: YYC3-AI-Family-Agent-L7-L8落地计划.md
description: P0 验收剩余改进项 L7（Histogram exemplars）与 L8（Git 基线）的落地计划
author: AI Tutor <Intelligent Application Implementation Expert>
version: v1.0.0
created: 2026-10-23
updated: 2026-10-23
status: in_progress
tags: [plan],[observability],[exemplars],[git],[l7],[l8]
category: plan
---
```

---

## 一、背景与定位

L7 / L8 来自 [P0 可观测数据面验收报告 v1.2.0](YYC3-AI-Family-Agent-P0可观测数据面验收报告.md) §六，是**非阻断改进项**：

| 编号 | 内容 | 当前状态 | 阻断性 |
| --- | --- | --- | --- |
| **L7** | Histogram 不支持 exemplars / native histogram | 指标可算 SLO，但无法从指标下钻到具体 trace | 非阻断 |
| **L8** | 工作区无 Git 版本基线 | 变更不可追溯、无法 diff 审计、无法复现 | 非阻断（但影响交付治理） |

**共同目标**：让「可观测」从「知道慢」升级为「知道**哪一次**慢」；让「代码资产」从「文件目录」升级为「可追溯版本」。

---

## 二、L7 落地计划：Histogram Exemplars

### 2.1 目标与价值

| 目标 | 可验证结果 |
| --- | --- |
| 指标样本可关联 traceId | `/metrics` 中出现合法 exemplar 行，携带 `trace_id` |
| 保持零依赖 | 不引入 prom-client / OpenTelemetry SDK |
| 不破坏既有门禁 | 78 例全绿；默认关闭，行为不变 |
| 基数与内存可控 | 每桶 exemplar 数量上限 + TTL；超限丢弃可观测（计数） |

**价值**：告警触发时可直接跳转到对应 trace（Grafana → Tempo/Jaeger），缩短定位时间；`family_memory_retrieval_duration_seconds` 与 `family_task_execution_duration_seconds` 两个直方图优先接入。

### 2.2 方案对比与选型

| 方案 | 原理 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- | --- |
| **A. OpenMetrics Exemplars** | 文本协议附 `# {trace_id="..."} value ts` | 兼容性好、实现小、Grafana 原生支持 | Prometheus 需开启 exemplar 存储（≥2.40） | ✅ **推荐** |
| B. Native Histogram | 稀疏桶 + 高精度 | 精度高、基数低 | 生态与配置复杂、文本 exposition 不适用 | 暂缓（可作为后续演进） |

**选型：方案 A**。默认关闭，通过配置开关启用；渲染协议按请求头协商（`Accept: application/openmetrics-text` → OpenMetrics 1.0 输出并以 `# EOF` 结尾）。

### 2.3 接口设计（增量、向后兼容）

```ts
// metrics-registry.ts
export interface ExemplarOptions {
  readonly enabled?: boolean;        // 默认 false
  readonly maxPerBucket?: number;    // 默认 1（每桶最多保留样例数）
  readonly ttlMs?: number;           // 默认 60_000（超时丢弃）
}

export interface Exemplar {
  readonly value: number;
  readonly timestampMs: number;
  readonly labels?: Readonly<Record<string, string>>; // 如 { trace_id }
}

// Histogram 新增
observe(value: number, labels?: LabelSet, exemplar?: Exemplar): void;
// MetricsRegistry 新增
histogram(name: string, help: string, buckets?: readonly number[], exemplars?: ExemplarOptions): Histogram;
// FamilyMetrics 新增便利方法
observeMemoryRetrieval(milliseconds: number, traceId?: string): void;
```

**渲染规则（仅 OpenMetrics 模式）**：

```text
family_memory_retrieval_duration_seconds_bucket{le="0.5"} 12 # {trace_id="trace-abc"} 0.42 1719123456.789
```

**约束**：

- exemplar 只挂到**落点桶**（`le` ≥ value 的最小桶），不复制到所有桶
- `timestampMs` 必须是观测时刻（秒级浮点输出）
- 每桶超过 `maxPerBucket` 时保留**最新**一条，丢弃计数进 `family_exemplars_dropped_total`
- TTL 到期由渲染时惰性清理（不引入后台定时器）

### 2.4 实施步骤

| # | 任务 | 产物 | 验收 |
| --- | --- | --- | --- |
| L7-1 | 注册器扩展：`ExemplarOptions` / `Exemplar` / `observe(..., exemplar)` | `metrics-registry.ts` | tsc 通过；关闭时输出与现网逐字节一致 |
| L7-2 | OpenMetrics 渲染分支：`renderOpenMetrics()`，`# EOF` 结尾，exemplar 行格式正确 | `metrics-registry.ts` | 单测断言格式 |
| L7-3 | 协议协商：`Accept` 头含 `application/openmetrics-text` 时返回 OpenMetrics；否则维持 `text/plain; version=0.0.4` | `metrics-server.ts` | 两种请求头分别断言 |
| L7-4 | 业务接线：`observeMemoryRetrieval(ms, traceId?)`、任务时长携带 `traceId` | `family-metrics.ts`、`assembly` 桥接 | 改造点最小，默认不传则不产生 exemplar |
| L7-5 | 丢弃计数指标 `family_exemplars_dropped_total` | `family-metrics.ts` | 超限场景断言 |
| L7-6 | 抓取配置：`prometheus.yml` 增加 `enable_features`/抓取 Exemplar 说明 | `ops/observability/prometheus.yml` | YAML 解析通过 |
| L7-7 | Grafana 面板：为两个直方图配置 exemplar 数据源与 trace 跳转 | `ops/observability/grafana-dashboards/family-overview.json` | 面板 JSON 合法 |
| L7-8 | 回归脚本纳入新用例；全量门禁 | `tests/integration/metrics-observability.spec.ts` | **78 + N 全绿** |

### 2.5 测试设计（新增 M9/M10）

| 用例 | 断言 |
| --- | --- |
| M9 默认关闭 | `/metrics` 不含 `# {`；输出与关闭前一致 |
| M10 启用 exemplar | 400ms 观测 + `trace_id=trace-x` → `le="0.5"` 行含该 exemplar；`le="0.3"` 行不含 |
| M10b 上限与 TTL | 同桶连续 3 次（max=1）→ 仅保留最新，`dropped_total=2`；过期后渲染不输出 |
| M10c 协议协商 | `Accept: application/openmetrics-text` → 含 `# EOF`；普通请求 → 0.0.4 |

### 2.6 验收标准

- [ ] 默认配置下 `/metrics` 与 v2.7.2 **逐字节一致**（无行为回归）
- [ ] 启用后 exemplar 行可被 Prometheus 2.40+ 正确解析（本地 `promtool check metrics` 或最小抓取验证）
- [ ] 每桶 exemplar 数量与 TTL 生效，丢弃计数可见
- [ ] Grafana 可从 P95 面板跳转到 trace
- [ ] 全量门禁全绿、tsc exit 0、零新增运行时依赖

### 2.7 风险与回滚

| 风险 | 等级 | 缓解 |
| --- | --- | --- |
| 基数/内存增长 | 中 | 每桶上限默认 1 + TTL + 丢弃计数；压测后调参 |
| Prometheus 版本不支持 exemplar | 中 | 明确最低版本；不启用时完全退化为 0.0.4 文本 |
| OpenMetrics 协商影响现有抓取 | 低 | 仅按 `Accept` 协商；默认抓取行为不变 |
| 渲染复杂度上升 | 低 | exemplar 存储与渲染隔离在独立方法，开关关闭时不执行 |

**回滚**：`exemplars.enabled=false`（默认）即恢复 v2.7.2 行为，无需回退代码。

---

## 三、L8 落地计划：Git 版本基线

### 3.1 目标

| 目标 | 可验证结果 |
| --- | --- |
| 代码可追溯 | 每次变更对应 commit；关键节点有 tag |
| 可复现 | 干净目录 `git clone` → `pnpm regression` → 全绿 |
| 与既有仓库关系清晰 | 明确「单仓多子系统」或「独立仓」，不产生两份真相 |
| 不泄露敏感信息 | `.env`、`data/`、密钥、构建产物不入库 |

### 3.2 现状与关键决策

**现状（2026-10-23 更新）**：

- 代码工作区：`YYC3-AI-FAmily-Agent/`（TypeScript 五支柱，v2.7.2），**已完成 `git init -b main` 与单次基线提交 `74f9281`**（405 文件 / 32,229 行），工作树干净
- 远端仓库：`YYC-Cube/YYC3-Family-AI-Agents`（**全新空仓**，原 Python 仓库已由仓库所有者删除）；本地已关联 `origin`
- 本仓库不再包含旧 Python 运行仓资产（`agent_server.py` / `governance_hub.py` / `agents/` / `deploy/` 等），按所有者决策只保留 TS 五支柱 + 工程配套 + 文档品牌

**决策（已执行）**：新仓为空白且不再包含 Python 主系统，**TypeScript 五支柱直接占据仓库根目录**，不设 `subsystems/` 前缀；原「单仓双子系统」方案随旧仓删除而失效。

| 方案 | 说明 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- | --- |
| **A. 根目录直放（已执行）** | TS 五支柱 + 工程配套 + 文档品牌直接作为仓库根 | 路径最短、与 README/CI 一致、无前缀噪音 | 若未来并入其他子系统需调整目录 | ✅ **已落地** |
| B. `subsystems/` 前缀 | 代码收进 `subsystems/yyc3-family-agent-ts/` | 预留多子系统扩展 | 当前仅一个子系统，属过度设计 | 暂不采用 |
| C. 独立仓库 / Submodule | 另起仓或子模块引用 | 边界清晰 | 版本对齐与治理成本高 | ❌ |

### 3.3 实施步骤

| # | 任务 | 命令/产物 | 验收 |
| --- | --- | --- | --- |
| L8-1 | 基线检查：确认无密钥/大文件/构建产物 | `git status`、人工审阅、`du -sh` | 无 `.env`、`data/`、`node_modules`、`.DS_Store` |
| L8-2 | 完善 `.gitignore` | 追加 `data/`、`*.tsbuildinfo`、`.DS_Store` | 已存在则校验 |
| L8-3 | 初始化并关联远端（方案 A：先克隆再挂载子目录） | `git clone` + 目录搬运（不做强制推送） | 目录落位正确 |
| L8-4 | 首次基线提交 | `chore(ts): 引入五支柱编程体系 v2.7.2 基线` | 单次提交可完整检出 |
| L8-5 | 打标签 | `subsystem/yyc3-family-agent-ts-v2.7.2` + `milestone/ts-five-pillars-p0` | `git tag -l` 可见 |
| L8-6 | CI 接入 | 复用 `.github/workflows/regression-gate.yml`（pnpm regression） | PR 上自动跑门禁 |
| L8-7 | 分支保护 | `main` 需 PR + 1 评审 + 门禁通过 | 直接 push 被拒 |
| L8-8 | 发布说明 | `CHANGELOG.md` 增加 TS 子体系条目；Release 附验收报告 | 可追溯到验收 v1.2.0 |

### 3.3.1 执行进度（2026-10-23）

| # | 状态 | 实证 |
| --- | --- | --- |
| L8-1 基线检查 | ✅ | 无 `.env` / `data/` / `node_modules` / `.DS_Store` 入库 |
| L8-2 `.gitignore` | ✅ | 覆盖 `node_modules/`、`dist/`、`data/`、`.env*`、`.DS_Store` |
| L8-3 初始化与关联远端 | ✅（方式调整） | 空仓前提下直接在工作区 `git init -b main` 并关联 `origin`，无需克隆搬运 |
| L8-4 基线提交 | ✅ | `74f9281`：405 文件 / 32,229 行，工作树干净 |
| L8-5 打标签 | ⬜ | 待推送后打 `subsystem/yyc3-family-agent-ts-v2.7.2` |
| L8-6 CI 接入 | ⬜ | `regression-gate.yml` 已入库；待远端启用并观察首跑 |
| L8-7 分支保护 | ⬜ | 待远端开启 PR + 门禁要求 |
| L8-8 发布说明 | ⬜ | 待首个 Release 关联验收报告 v1.2.0 |

> 远端推送**未执行**（遵循「不擅自推送」原则）。所有者执行 `git push -u origin main` 后，可继续 L8-5～L8-8。

### 3.4 标签规范（与主仓三类标签对齐）

| 类型 | 格式 | 示例 |
| --- | --- | --- |
| 子体系版本 | `subsystem/<name>-vX.Y.Z` | `subsystem/yyc3-family-agent-ts-v2.7.2` |
| 里程碑 | `milestone/<kebab-case>` | `milestone/ts-five-pillars-p0` |
| 主仓版本 | `vX.Y.Z` | `v3.1.0`（Python 主系统，不混用） |

### 3.5 验收标准

- [ ] `git clone` 到空目录 → `pnpm install` → `pnpm regression` → **78/78 全绿**
- [ ] `git status` 干净；`git log --oneline` 可读
- [ ] 密钥扫描（gitleaks / `git secrets`）无命中
- [ ] PR 流水线自动执行 typecheck + regression
- [ ] 标签可在远端查看；Release 关联验收报告

### 3.6 风险与应对

| 风险 | 等级 | 应对 |
| --- | --- | --- |
| 误提交密钥/大数据 | 高 | 提交前扫描；已泄露则轮换并清理历史（按需） |
| 两套工具链（Python + pnpm）混淆 | 中 | 分目录 + 各自脚本命名空间（`deploy/` vs `scripts/`） |
| 仓库体积膨胀 | 中 | 排除构建产物；必要时 LFS |
| 历史改写风险 | 高 | **禁止** `push --force` 到 `main`；历史修正须仓库所有者批准 |

---

## 四、执行顺序与依赖

```text
L8（先行，约 0.5 个里程碑）
  → 建立版本基线，使 L7 的改动可 diff / 可回滚
L7（其后）
  → L7-1 ~ L7-3 注册器与协议（纯新增，风险最低）
  → L7-4 业务接线（最小改动）
  → L7-6 / L7-7 部署与面板
  → L7-8 回归门禁
```

**理由**：先有 Git 基线，L7 的每一步才能被审计与回退；否则「默认关闭逐字节一致」缺少可验证的对比基线。

---

## 五、验收总表

| 项 | 验收口径 |
| --- | --- |
| L7 功能 | 启用后 exemplar 可抓取、可跳转；关闭时零行为差异 |
| L7 质量 | 新增用例全过；既有 78 例零回归；tsc exit 0 |
| L7 安全 | 无新增依赖；exemplar 不含敏感字段（仅 traceId） |
| L8 治理 | 可克隆复现、标签齐备、门禁自动执行、无敏感信息 |
| 文档 | 架构 §8.3 记录 v2.8.0（L7）/ v2.7.3（L8 基线）；验收报告追加 §十三 |

---

## 六、变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v1.0.0 | 2026-10-23 | 初版：L7 Exemplars 方案 A 选型 + L8 单仓子体系决策；含步骤、测试、验收、风险与回滚 |

---

> 「***YanYuCloudCube***」
> 「***<admin@0379.email>***」
> 「***Words Initiate Quadrants, Language Serves as Core for the Future***」
> 「***All things converge in cloud pivot; Deep stacks ignite a new era of intelligence***」

**© 2025-2026 YanYuCloudCube™. All Rights Reserved.**
