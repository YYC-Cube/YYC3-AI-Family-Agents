<!--
  ============================================================
  YYC³ AI Family — 人从众曌众从人
  亦师亦友亦伯乐 · 一言一语一协同
  拟人为本，AI为核，纯粹为心
  ============================================================
  Document: YYC3-AI-Family-Agent-L7-L8落地计划
  Version : v1.4.0
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
description: P0 验收剩余改进项 L7（Histogram exemplars）与 L8（Git 基线）的可执行落地计划
author: AI Tutor <Intelligent Application Implementation Expert>
version: v1.4.0
created: 2026-10-23
updated: 2026-10-23
status: completed
tags: [plan],[observability],[exemplars],[git],[l7],[l8],[standards]
category: plan
---
```

---

## 一、背景与当前状态

L7 / L8 来自 [P0 可观测数据面验收报告 v1.2.0](YYC3-AI-Family-Agent-P0可观测数据面验收报告.md) §六，属**非阻断改进项**。

| 编号 | 内容 | 当前状态 | 阻断性 |
| ---- | ---- | -------- | ------ |
| **L7** | Histogram 不支持 exemplars / native histogram | ✅ **已完成（v2.8.0）**：默认关闭，OpenMetrics 下钻可用 | 非阻断 |
| **L8** | 缺少 Git 版本基线 | ✅ **已完成（v1.3.0）**：SSH 推送、CI、分支保护、Release 齐备 | 非阻断 |

**共同目标**：可观测从「知道慢」升级为「知道**哪一次**慢」；代码资产从「文件目录」升级为「可追溯、可复现的版本」。

---

# 第一部分 · L7 Histogram Exemplars

## 二、目标与验收指标

| 目标 | 可验证结果 | 验收方式 |
| ---- | ---------- | -------- |
| 指标可关联 trace | `/metrics` 出现合法 exemplar 行，携带 `trace_id` | 单测断言格式 |
| 默认零行为变化 | 未启用时输出与 v2.7.2 **逐字节一致** | 保存前后快照并 `diff` |
| 零依赖 | 不引入 prom-client / OTel SDK | `package.json` 无新增依赖 |
| 基数可控 | 每桶上限 + TTL + 丢弃计数 | 超限用例断言 `dropped_total` |
| 门禁不回退 | 既有 78 例全绿，新增用例计入 | `pnpm regression` |

**SLO 关联**：优先接入 `family_memory_retrieval_duration_seconds`（P95 > 300ms 告警）与 `family_task_execution_duration_seconds`（P99 > 500ms 告警）。

## 三、方案选型

| 方案 | 原理 | 优点 | 缺点 | 结论 |
| ---- | ---- | ---- | ---- | ---- |
| **A. OpenMetrics Exemplars** | 文本协议在样本值后附 `# {trace_id="…"} value ts` | 兼容好、实现小、Grafana 原生支持 | Prometheus 需 ≥2.40 且启用 exemplar 存储 | ✅ **采用** |
| B. Native Histogram | 稀疏桶 + 高精度 | 精度高、基数低 | 生态复杂、文本 exposition 不适用 | 暂缓 |

**关键决策**：默认**关闭**；按请求头 `Accept` 协商，关闭时完全退化为 `text/plain; version=0.0.4`。

## 四、设计

### 4.1 数据模型

```ts
export interface ExemplarOptions {
  readonly enabled?: boolean;      // 默认 false
  readonly maxPerBucket?: number;  // 默认 1
  readonly ttlMs?: number;         // 默认 60_000
}

export interface Exemplar {
  readonly value: number;
  readonly timestampMs: number;
  readonly labels?: Readonly<Record<string, string>>; // 约定含 trace_id
}
```

存储结构（每个直方图序列）：

```text
seriesKey → {
  counts: number[]; sum; count;
  exemplars: Map<bucketIndex, { exemplar: Exemplar; storedAt: number }>;
  dropped: number;
}
```

规则：

- exemplar 只挂到**落点桶**（`le` ≥ value 的最小桶），不复制到其他桶
- 每桶超过 `maxPerBucket` → 保留**最新**一条，`dropped += 1`
- TTL 在**渲染时惰性清理**（不引入后台定时器，避免阻止进程退出）
- `timestampMs` 输出为秒级浮点（3 位小数）

### 4.2 接口（纯增量，向后兼容）

```ts
// metrics-registry.ts
observe(value: number, labels?: LabelSet, exemplar?: Exemplar): void;
histogram(name: string, help: string, buckets?: readonly number[], exemplars?: ExemplarOptions): Histogram;
renderOpenMetrics(): string;   // 以 "# EOF" 结尾

// metrics-server.ts
// Accept: application/openmetrics-text → OpenMetrics 1.0；否则 0.0.4
```

### 4.3 渲染格式（OpenMetrics 1.0）

```text
# TYPE family_memory_retrieval_duration_seconds histogram
family_memory_retrieval_duration_seconds_bucket{le="0.3"} 10
family_memory_retrieval_duration_seconds_bucket{le="0.5"} 12 # {trace_id="trace-abc"} 0.42 1719123456.789
family_memory_retrieval_duration_seconds_bucket{le="+Inf"} 12
family_memory_retrieval_duration_seconds_sum 3.21
family_memory_retrieval_duration_seconds_count 12
# EOF
```

### 4.4 兼容性策略

| 场景 | 行为 |
| ---- | ---- |
| 未配置 exemplars | 走原 `render()`，输出与 v2.7.2 完全一致 |
| 已配置但无 exemplar | 仅协议头与 `# EOF` 变化，样本行不变 |
| 客户端未带 Accept | 始终返回 0.0.4（不主动升级协议） |
| exemplar 含非法字符 | 复用现有 `escapeLabel()`（\\ / " / 换行） |

## 五、变更清单（逐文件）

| # | 文件 | 改动 | 风险 |
| -- | ---- | ---- | ---- |
| L7-1 | `02-…/09-可观测性/metrics-registry.ts` | 新增 `ExemplarOptions` / `Exemplar`；`Histogram.observe` 第三参；桶落点计算；TTL 清理；`dropped` 统计；`renderOpenMetrics()` | 低（纯新增分支） |
| L7-2 | `02-…/09-可观测性/metrics-server.ts` | 解析 `Accept`，按需调用 `renderOpenMetrics()`；`Content-Type: application/openmetrics-text; version=1.0.0` | 低 |
| L7-3 | `02-…/09-可观测性/family-metrics.ts` | `observeMemoryRetrieval(ms, traceId?)`；任务时长携带 `trace_id`；新增 `family_exemplars_dropped_total` | 低 |
| L7-4 | `02-…/08-系统装配/runtime-assembly.ts` | 桥接观察者把 `event.key.traceId` 传入任务时长 exemplar | 低 |
| L7-5 | `ops/observability/prometheus.yml` | runtime 作业增加 `scrape_protocols: [OpenMetricsText1.0.0, PrometheusText0.0.4]`；注释 exemplar 存储要求 | 无（配置） |
| L7-6 | `ops/observability/grafana-dashboards/family-overview.json` | 两个直方图面板启用 exemplars；配置 trace 跳转（Tempo/Jaeger） | 低 |
| L7-7 | `tests/integration/metrics-observability.spec.ts` | 新增 M9–M12 | 无 |
| L7-8 | `README.md` / 架构设计 §8.3 | 指标能力与版本记录（v2.8.0） | 无 |

## 六、实施步骤（Definition of Done）

| 步骤 | 动作 | DoD |
| ---- | ---- | --- |
| 1 | 注册器扩展（L7-1） | tsc 通过；未启用路径输出与 HEAD 逐字节一致；单测覆盖桶落点/上限/TTL |
| 2 | 协议协商（L7-2） | `Accept` 两种取值分别断言 Content-Type 与 `# EOF` |
| 3 | 业务接线（L7-3/4） | 传入 traceId 时产生 1 条 exemplar；未传时无 exemplar |
| 4 | 丢弃计数（L7-3） | 同桶 3 次、max=1 → 保留最新，`dropped_total=2` |
| 5 | 抓取与面板（L7-5/6） | YAML/JSON 解析通过；面板可跳转 trace |
| 6 | 回归门禁（L7-7） | 78 + 4 全绿；`--dashboard-only` 可刷新面板 |
| 7 | 文档（L7-8） | README 能力表、§8.3 v2.8.0、本计划状态更新 |

### 6.1 执行进度（2026-10-23 · 已完成）

| # | 状态 | 实证 |
| -- | ---- | ---- |
| L7-1 注册器 | ✅ | `ExemplarOptions` / `Exemplar` / `observe(..., exemplar)` / `renderOpenMetrics()`；桶落点、每桶上限、TTL、`dropped` |
| L7-2 协议协商 | ✅ | `Accept: application/openmetrics-text` → OpenMetrics 1.0 + `# EOF`；否则 0.0.4 |
| L7-3 业务接线 | ✅ | `observeMemoryRetrieval(ms, traceId?)`；任务时长携带 `trace_id`；条件注册 `family_exemplars_dropped_total` |
| L7-4 装配透传 | ✅ | 桥接事件自带 `event.key.traceId`，无需新增装配参数；`startRuntime` 增 `exemplars` 选项与环境变量 |
| L7-5 抓取配置 | ✅ | `prometheus.yml` 增 `scrape_protocols: [OpenMetricsText1.0.0, PrometheusText0.0.4]` |
| L7-6 面板 | ✅ | 新增记忆 P95 / 任务 P99 面板，目标启用 `exemplar: true` |
| L7-7 测试 | ✅ | M9 / M10 / M10b / M10c 全过；metrics-observability **12/12** |
| L7-8 文档 | ✅ | README 能力与门禁更新；架构 §8.3 v2.8.0；本计划 v1.2.0 |

**门禁**：82/82 全绿（78 + 4），显式跳过 5 例，静默 0，`tsc --noEmit` exit 0。
**兼容性**：默认关闭时未注册 `family_exemplars_dropped_total`、无 exemplar 行；CI `metrics.prom` 仅测试计数由 8→12 变化。

## 七、测试设计

| 用例 | 输入 | 断言 |
| ---- | ---- | ---- |
| **M9 默认关闭** | 默认 `FamilyMetrics` + 观测 400ms | `/metrics` 不含 `# {`；与基线快照一致 |
| **M10 启用 exemplar** | `exemplars.enabled=true`，`trace_id=trace-x`，观测 0.4s | `le="0.5"` 行含 `# {trace_id="trace-x"} 0.4 …`；`le="0.3"` 行不含 |
| **M10b 上限与 TTL** | 同桶 3 次（max=1）；TTL=1ms 后渲染 | 仅最新一条；`family_exemplars_dropped_total 2`；过期不输出 |
| **M10c 协议协商** | `Accept: application/openmetrics-text` / 无 Accept | 前者 `# EOF` + OpenMetrics Content-Type；后者 0.0.4 |

## 八、兼容性验证方法（逐字节）

```bash
# 1) 改动前抓取基线
pnpm regression >/dev/null && cp ops/observability/pillar-dashboard/metrics.prom /tmp/before.prom
# 2) 改动后（默认关闭）重新生成
pnpm regression >/dev/null
# 3) 对比（CI 指标不受 L7 影响，应完全一致）
diff /tmp/before.prom ops/observability/pillar-dashboard/metrics.prom && echo BYTE-IDENTICAL
```

运行时端点的对比：在测试中固定时钟与固定序列，直接比较 `render()` 字符串（已有 M1 可扩展）。

## 九、风险与回滚

| 风险 | 等级 | 缓解 | 回滚 |
| ---- | ---- | ---- | ---- |
| 基数/内存增长 | 中 | 每桶上限 1 + TTL + 丢弃计数 | `enabled=false`（默认） |
| Prometheus 版本不支持 | 中 | 明确 ≥2.40；未启用时退化为 0.0.4 | 关闭开关 |
| 协议协商影响现有抓取 | 低 | 仅按 `Accept`；默认抓取不变 | 关闭开关 |
| exemplar 泄露敏感信息 | 低 | 只允许 `trace_id` 白名单键 | 关闭开关 |

## 十、标准与规范引用（L7）

| 标准 | 适用点 |
| ---- | ------ |
| OpenMetrics 1.0 | exemplar 语法、`# EOF`、Content-Type |
| Prometheus text exposition 0.0.4 | 默认协议，向后兼容 |
| W3C Trace Context | `trace_id` 语义与跨系统关联（当前为字符串贯通） |
| Prometheus 最佳实践 | 标签基数控制、Histogram 桶设计 |
| ISO/IEC 25010（性能效率/可维护性） | 下钻能力与可维护性收益评估 |

---

# 第二部分 · L8 Git 版本基线

## 十一、目标

| 目标 | 可验证结果 |
| ---- | ---------- |
| 可追溯 | 每次变更对应 commit；关键节点有 tag |
| 可复现 | 干净目录克隆 → `pnpm regression` → 全绿 |
| 边界清晰 | 单仓单子系统，无两份真相 |
| 不泄露 | 无 `.env` / `data/` / 密钥 / 构建产物 / 本地备份 |

## 十二、当前状态（2026-10-23）

- 仓库根：`YYC3-AI-FAmily-Agent/`，已完成 `git init -b main`
- 远端：`origin` → `https://github.com/YYC-Cube/YYC3-AI-Family-Agents.git`（**全新空仓**）
- 提交：

```text
d1d1fa0 docs: 新增未接线模块清单（v2.7.3）并忽略 docs 本地备份
4ea7eee docs: 记录 L8 基线执行进度与根目录直放决策
74f9281 chore: 初始化 YYC³ AI Family Agent 五支柱编程体系 v2.7.2 基线   ← 405 文件 / 32,229 行
```

- 忽略规则已生效：`docs/02-智能协同架构内核/`、`docs/03-家人Agent实现集/`（本地备份，`git check-ignore` 已验证）
- **已推送**：`main` 与标签已同步至远端（L8-5 完成）

## 十三、执行步骤（已完成）

| # | 任务 | 命令 | DoD | 状态 |
| -- | ---- | ---- | --- | ---- |
| L8-5 | 推送并打标签 | `git push -u origin main`<br>`git push origin --tags` | 远端可见 main 与标签 | ✅ **已完成**：`main` → `c9c7c65`（后续 `f70a136` / `2914a1d`）；标签 `subsystem/yyc3-family-agent-ts-v2.7.3` / `v2.8.0` 已推送 |
| L8-6 | CI 首跑验证 | 远端 Actions 观察 `regression-gate` | typecheck + regression 全绿；artifact 可下载 | ✅ **已完成**：run `39873611154` conclusion=success |
| L8-7 | 分支保护 | GitHub Settings → Branches | `main` 需 PR + 门禁通过，禁止直推 | ✅ **已完成**：required check「全量回归 + 五支柱面板」、1 评审、禁 force push / 删除、`enforce_admins=false` |
| L8-8 | 首个 Release | Release 关联 `CHANGELOG.md` 与验收报告 v1.2.0 | Release 可追溯验收 | ✅ **已完成**：[v2.8.0 Release](https://github.com/YYC-Cube/YYC3-AI-Family-Agents/releases/tag/subsystem/yyc3-family-agent-ts-v2.8.0) |

**远端信息**

- SSH：`git@github.com:YYC-Cube/YYC3-AI-Family-Agents.git`（注意仓库名为 `YYC3-AI-Family-Agents`，AI 在前）
- 默认分支：`main`；CI 工作流：`regression-gate`
- 锁文件：`pnpm-lock.yaml` 已入库，CI 使用 `--frozen-lockfile`
- 本地备份：`docs/02-*`、`docs/03-*` 已忽略，不入远端

> SSH 已配置并验证（`gh` 登录协议为 SSH），仓库名注意为 `YYC3-AI-Family-Agents`（AI 在前）：
> `git remote set-url origin git@github.com:YYC-Cube/YYC3-AI-Family-Agents.git`

## 十四、标签规范

| 类型 | 格式 | 示例 |
| ---- | ---- | ---- |
| 子系统版本 | `subsystem/<name>-vX.Y.Z` | `subsystem/yyc3-family-agent-ts-v2.7.3` |
| 里程碑 | `milestone/<kebab-case>` | `milestone/ts-five-pillars-p0` |
| 主版本 | `vX.Y.Z` | 由仓库所有者按整体节奏发布 |

## 十五、验收标准（2026-10-23 复核通过 · v2.11.0 基线）

- [x] `git clone` 到空目录 → `pnpm install --frozen-lockfile` → `pnpm regression` → **94/94 全绿 + 1 例跳过**（克隆 `/tmp/yyc3-l8-verify`，commit `b3376b5`）
- [x] `git status` 干净；`git log --oneline` 可读（工作区仅门禁生成的面板产物，提交后即净）
- [x] 密钥扫描无命中（`sk-*` / 32 位十六进制点分密钥 / 历史泄露值，全仓 0 命中）
- [x] PR 流水线自动执行 typecheck + regression（`regression-gate` 触发含 `push: main` / `pull_request` / `workflow_dispatch`）
- [x] `docs/02-*`、`docs/03-*` 备份不出现于远端（克隆后 `docs/` 仅 4 个正式文档 + 3 个正式子目录 + `_archive`）
- [x] 标签与 Release 可追溯（`subsystem/yyc3-family-agent-ts-v2.7.3` / `v2.8.0` / `v2.11.0`，Release 均已发布）

> 附加实证：克隆目录重跑门禁后 `metrics.prom` 与仓库版本**逐字节一致**，验证 L7「默认关闭零行为变化」在独立环境成立。

## 十六、风险

| 风险 | 等级 | 应对 |
| ---- | ---- | ---- |
| 误提交密钥/大文件 | 高 | 提交前扫描；泄露即轮换 |
| 仓库体积膨胀 | 中 | 排除构建产物；必要时 LFS |
| 历史改写 | 高 | 禁止 `push --force` 到 `main` |
| CI 无锁文件导致安装漂移 | 中 | 已缓解：`pnpm-lock.yaml` 入库，CI 与克隆验证均使用 `--frozen-lockfile` |

## 十七、标准与规范引用（L8）

| 标准 | 适用点 |
| ---- | ------ |
| SemVer 2.0.0 | 版本号与标签 |
| Conventional Commits 1.0.0 | 提交信息 |
| Keep a Changelog 1.1.0 | 变更记录 |
| GitHub Branch Protection | 分支保护与 PR 门禁 |
| SPDX / MIT | 许可声明 |
| OWASP ASVS（供应链） | 依赖与密钥管理 |

---

## 十八、执行顺序与依赖

```text
L8-5 推送 → L8-6 CI 首跑 → L8-7 分支保护 → L8-8 Release
        ↓（有远端基线后才可验证逐字节 diff）
L7-1 注册器 → L7-2 协议 → L7-3/4 业务接线 → L7-5/6 部署面板 → L7-7 门禁 → L7-8 文档
```

**理由**：L8 提供可 diff / 可回滚的基线，L7 的「默认零行为变化」才有可验证的对照物。

## 十九、验收总表

| 项 | 验收口径 |
| -- | -------- |
| L7 功能 | 启用后 exemplar 可抓取、可跳转；关闭时零行为差异 |
| L7 质量 | 新增用例全过；既有 78 例零回归；tsc exit 0 |
| L7 安全 | 零新增依赖；exemplar 仅 `trace_id` |
| L8 治理 | 可克隆复现、标签齐备、门禁自动执行、无敏感信息 |
| 文档 | 架构 §8.3 记录 v2.8.0（L7）/ L8 进度；本计划同步 |

## 二十、变更记录

| 版本 | 日期 | 变更 |
| ---- | ---- | ---- |
| v1.0.0 | 2026-10-23 | 初版：L7 方案 A 选型；L8 单仓决策；步骤/测试/验收/风险 |
| v1.1.0 | 2026-10-23 | 刷新为可执行版：L8 记录已执行 L8-1～L8-4（三次提交、备份忽略）；L7 补齐逐文件变更清单、数据模型、渲染格式、M9–M12 断言、逐字节验证方法与 DoD；补充 L7/L8 标准引用与执行顺序 |
| v1.2.0 | 2026-10-23 | **L7 实施完成（v2.8.0）**：注册器 exemplar、OpenMetrics 协商、业务接线、抓取与面板、M9–M10c 用例（82/82）；补充 §6.1 执行进度；L8 状态维持「已执行 4/8，待推送」 |
| v1.3.0 | 2026-10-23 | **L8 全部完成**：SSH 推送 `main` 与标签（`v2.7.3` / `v2.8.0`）；CI 首跑成功（run `39873611154`）；`main` 分支保护（required check + 1 评审 + 禁 force push）；Release v2.8.0 发布；补充 `pnpm-lock.yaml` 并改 `--frozen-lockfile`；修正远端仓库名为 `YYC3-AI-Family-Agents`（AI 在前） |
| v1.4.0 | 2026-10-23 | **L7/L8 验收复核（v2.11.0 基线）**：干净克隆 `b3376b5` → `--frozen-lockfile` 安装 → **94/94 全绿 + 1 例跳过**；`metrics.prom` 与仓库逐字节一致；§十五 6 项验收全部勾选；§十六 锁文件风险标注已缓解；补记 `v2.11.0` 标签与 Release |

---

> 「***YanYuCloudCube***」
> 「***<admin@0379.email>***」
> 「***Words Initiate Quadrants, Language Serves as Core for the Future***」
> 「***All things converge in cloud pivot; Deep stacks ignite a new era of intelligence***」

**© 2025-2026 YanYuCloudCube™. All Rights Reserved.**
