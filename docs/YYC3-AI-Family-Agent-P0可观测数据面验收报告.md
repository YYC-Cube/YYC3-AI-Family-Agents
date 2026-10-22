<!--
  ============================================================
  YYC³ AI Family — 人从众曌众从人
  亦师亦友亦伯乐 · 一言一语一协同
  拟人为本，AI为核，纯粹为心
  ============================================================
  Document: YYC3-AI-Family-Agent-P0可观测数据面验收报告
  Version : v1.0.0
  Contact : admin@yanyucloud.com
  Homepage: https://matrix.yyc3.top
  ============================================================
-->

# YYC³-AI-Family-Agent · P0 可观测数据面验收报告

> ***YanYuCloudCube***
> 言启象限 | 语枢未来
> *Words Initiate Quadrants, Language Serves as Core for the Future*
> 万象归元于云枢 | 深栈智启新纪元

---

```yaml
---
file: YYC3-AI-Family-Agent-P0可观测数据面验收报告.md
description: P0 指标采集落地（v2.7.0～v2.7.2）验收报告——指标产出 / 暴露 / 鉴权 / 告警消费全链路实证
author: AI Tutor <Intelligent Application Implementation Expert>
version: v1.2.0
created: 2026-10-23
updated: 2026-10-23
status: accepted
tags: [acceptance],[observability],[metrics],[p0],[v2.7.2]
category: report
---
```

---

## 一、验收结论

| 项 | 结论 |
| --- | --- |
| **总体结论** | ✅ **通过（无条件）** —— v2.7.1 补齐放行条件，v2.7.2 关闭改进项 L4/L5，实证见 §十一 / §十二 |
| **验收对象** | v2.7.0「P0 可观测数据面」+ v2.7.1「放行条件闭环」+ v2.7.2「改进项闭环」 |
| **验收依据** | 架构设计 §8.3 v2.7.0～v2.7.2 变更记录；本报告 §三 逐项实测、§十一/§十二 闭环实证 |
| **验收日期** | 2026-10-23（Asia/Shanghai） |
| **实证命令** | `tsc --noEmit` → exit 0；`pnpm regression` → **78/78 全绿 + 5 例显式跳过**；静默 spec **归零**；Pushgateway 推送实测 19 条样本 |

**一句话判据**：指标从「无代码产出」变为「有代码产出、有端点暴露、有告警消费、有 CI 指标」，且引用指标与声明指标一一对齐，未出现空转占位。

---

## 二、验收范围

### 2.1 交付清单

| # | 类型 | 产物 | 落位 |
| --- | --- | --- | --- |
| 1 | 新增模块 | [metrics-registry.ts](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/02-智能协同架构内核/09-可观测性/metrics-registry.ts) —— 零依赖 Counter/Gauge/Histogram + 文本 exposition | 09-可观测性 |
| 2 | 新增模块 | [family-metrics.ts](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/02-智能协同架构内核/09-可观测性/family-metrics.ts) —— 14 项 `family_*` 指标 + 埋点门面 + 记忆检索装饰器 | 09-可观测性 |
| 3 | 新增模块 | [metrics-server.ts](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/02-智能协同架构内核/09-可观测性/metrics-server.ts) —— `/metrics` + `/healthz` | 09-可观测性 |
| 4 | barrel | [index.ts](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/02-智能协同架构内核/09-可观测性/index.ts) | 09-可观测性 |
| 5 | 埋点改造 | [trajectory-bridge.ts](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/02-智能协同架构内核/02-云枢核心引擎/family-communication-bus/trajectory-bridge.ts) 增 `onEvent` 观察者 | 02-云枢核心引擎 |
| 6 | 埋点改造 | [learning-loop.ts](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/02-智能协同架构内核/05-持续学习引擎/learning-loop.ts) 增 `onCycle` 只读钩子 | 05-持续学习引擎 |
| 7 | 装配接线 | [runtime-assembly.ts](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/02-智能协同架构内核/08-系统装配/runtime-assembly.ts) 增 `metrics` 选项与三处埋点 | 08-系统装配 |
| 8 | 告警激活 | [prometheus-rules.yaml](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/ops/observability/prometheus-rules.yaml) 7 条 expr 全部接真实指标 | ops/observability |
| 9 | CI 指标 | [run-regression.mjs](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/scripts/run-regression.mjs) 生成 `metrics.prom` | scripts |
| 10 | 验收测试 | [metrics-observability.spec.ts](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/tests/integration/metrics-observability.spec.ts) M1–M6 | tests/integration |
| 11 | 变更记录 | 架构设计 §8.3 **v2.7.0** | docs |
| 12 | 进程入口（v2.7.1） | [runtime-entry.ts](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/02-智能协同架构内核/08-系统装配/runtime-entry.ts) —— `startRuntime` / `startRuntimeFromEnv` | 08-系统装配 |
| 13 | 鉴权加固（v2.7.1） | [metrics-server.ts](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/02-智能协同架构内核/09-可观测性/metrics-server.ts) Bearer 鉴权 + 默认回环绑定 | 09-可观测性 |
| 14 | 抓取配置（v2.7.1） | [prometheus.yml](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/ops/observability/prometheus.yml) —— 运行时 / Pushgateway / 自身三作业 | ops/observability |
| 15 | 指标推送（v2.7.1） | [push-metrics.mjs](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/scripts/push-metrics.mjs) + CI 步骤 | scripts / CI |
| 16 | 愈链路装配（v2.7.2） | [degradation-controller.ts](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/02-智能协同架构内核/07-自愈中心/degradation-controller/degradation-controller.ts) `onStateChange` + `runtime-assembly.handleSignal` | 07 / 08 |
| 17 | 测试迁移（v2.7.2） | [self-judge-kit.spec.ts](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/tests/unit/self-judge-kit.spec.ts) / [family-bus.spec.ts](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/tests/integration/family-bus.spec.ts) / [pillars.contract.ts](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/tests/pillar-contracts/pillars.contract.ts) / [qianhang-intent-e2e.spec.ts](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/tests/e2e/qianhang-intent-e2e.spec.ts) | tests |

### 2.2 不在本次范围

- P1 真实 LLM provider（openai / zhipu）——按用户明确指示**暂不推进**
- 九层底座（layer-1～9）契约转实
- Prometheus / Grafana 实例部署编排（仓库内无对应服务定义）

---

## 三、逐项验收

### A. 指标产出能力（AC-1）

| 验收点 | 预期 | 实测 | 结论 |
| --- | --- | --- | --- |
| 零依赖实现 | 不引入 prom-client / express | `metrics-registry.ts` 仅用标准库；`metrics-server.ts` 仅 `node:http` | ✅ |
| Counter / Gauge / Histogram 三类型 | 支持 | 三类均实现并有断言 | ✅ |
| 文本 exposition 规范 | `# HELP` / `# TYPE` / 样本行 | M1 断言四要素齐备 | ✅ |
| 标签确定性 | 按 key 字典序 | `family_demo_total{a="1",b="2"}` 断言通过 | ✅ |
| 累积直方图 | `_bucket{le}` 累积 + `_sum` + `_count` | `le="0.1"→1`、`le="0.5"→2`、`le="+Inf"→2`、`_count 2` 全通过 | ✅ |
| 特殊值处理 | NaN / ±Inf 合法字面量 | `formatNumber` 分支实现 | ✅ |

### B. 指标覆盖度（AC-2）

**运行期指标 14 项**（`FamilyMetrics` 声明）：

| # | 指标 | 类型 | 埋点来源 |
| --- | --- | --- | --- |
| 1 | `family_task_executed_total{outcome}` | Counter | `TrajectoryBridge.onEvent` |
| 2 | `family_task_execution_duration_seconds` | Histogram | `TrajectoryBridge.onEvent` |
| 3 | `family_trajectory_bridge_events_total{result}` | Counter | `TrajectoryBridge.onEvent` |
| 4 | `family_learning_cycles_total` | Counter | `LearningLoop.onCycle` |
| 5 | `family_learning_promoted_total` | Counter | `LearningLoop.onCycle` |
| 6 | `family_learning_rolled_back_total` | Counter | `LearningLoop.onCycle` |
| 7 | `family_learning_regression_failed_cases` | Gauge | `LearningLoop.onCycle` |
| 8 | `family_selfjudge_agreement_ratio` | Gauge | `recordConsistency`（ConsistencyTracker 快照） |
| 9 | `family_selfjudge_mirage_total` | Gauge | `recordConsistency` |
| 10 | `family_memory_retrieval_duration_seconds` | Histogram | `instrumentMemoryOrchestrator` |
| 11 | `family_healing_actions_total{layer,status}` | Counter | `RollbackController` 记账 → 装配层 |
| 12 | `family_healing_rto_seconds{layer}` | Gauge | 同上 |
| 13 | `family_healing_contract_met{layer}` | Gauge | 同上 |
| 14 | `family_circuit_state{state}` | Gauge | `recordCircuitState`（需调用方埋点，见 §六 L5） |

**CI 指标 3 项**（`metrics.prom`）：`family_regression_gate_failed_total`、`family_pillar_failed_cases{pillar}`、`family_regression_spec_passed{spec}`。

### C. 端点暴露（AC-3）

| 验收点 | 实测（M6） | 结论 |
| --- | --- | --- |
| `GET /metrics` 返回 200 | 断言通过 | ✅ |
| Content-Type 为 Prometheus 文本协议 | `text/plain; version=0.0.4` | ✅ |
| 文本含 `# TYPE` 与样本行 | `family_task_executed_total{outcome="completed"} 1` 命中 | ✅ |
| `GET /healthz` 返回 200 | 断言通过 | ✅ |
| 未知路由 404 | 断言通过 | ✅ |
| 端口 0 随机分配 | 句柄回传实际端口，测试可并发 | ✅ |

### D. 埋点非侵入性（AC-4）

| 验收点 | 实测 | 结论 |
| --- | --- | --- |
| 业务决策不被观测改变 | `onCycle` 为只读回调，报告对象生成后触发 | ✅ |
| 记忆编排器零改动 | Proxy 装饰器包装，`MemoryOrchestratorImpl` 未修改 | ✅ |
| 未传 `metrics` 时行为不变 | 所有埋点均 `metrics?` 可选链，既有 57 例不回归 | ✅ |
| 部署侧自定义 `onCycle` 不被覆盖 | 装配层先报指标再调用 `userOnCycle` | ✅ |

### E. 告警消费闭环（AC-5）

| # | 告警 | expr 引用指标 | 指标真实来源 | 结论 |
| --- | --- | --- | --- | --- |
| 1 | HighPerfP99Latency | `family_task_execution_duration_seconds_bucket` | Histogram 派生（`le` 分桶） | ✅ |
| 2 | HighAvailabilityErrorRate | `family_task_executed_total{outcome}` | 桥接埋点；`clamp_min` 防 0/0 | ✅ |
| 3 | SelfJudgeCalibrationDrift | `family_selfjudge_agreement_ratio` | `recordConsistency` | ✅ |
| 4 | MemoryRetrievalSlow | `family_memory_retrieval_duration_seconds_bucket` | Histogram 派生（P95 > 300ms） | ✅ |
| 5 | LearningRegressionFailure | `family_learning_regression_failed_cases` | `onCycle` | ✅ |
| 6 | RegressionGateFailed | `family_regression_gate_failed_total` | CI `metrics.prom` | ✅ |
| 7 | FivePillarDashboardRed | `family_pillar_failed_cases{pillar}` | CI `metrics.prom` | ✅ |

**对齐核验**：脚本提取 7 条 expr 中的 `family_*` 指标共 7 个 → 其中 3 个为 Histogram 派生（`_bucket`）、2 个为 CI 侧产物，与代码声明一致，**无孤儿引用**；YAML 解析得 2 组 7 告警，结构合法。

### F. 门禁不回归（AC-6）

| 检验 | 结果 |
| --- | --- |
| 根级类型检查 | `tsc --noEmit` exit 0 |
| 全量回归 | **78/78 全绿**，exit 0；另 5 例显式跳过 |
| 新增用例 | metrics-observability **8/8**；assembly-e2e **6/6**（含 A6 愈链路） |
| 既有用例 | 原 57 例全数保持通过，零回归；4 个原静默 spec 转为真实断言 / 显式跳过 |

**逐套件明细（实测输出）**

| 套件 | 通过 | 支柱归属 |
| --- | --- | --- |
| procedural-extraction | 15/15 | 知 |
| self-judge-kit | 3/3 | 自 |
| self-judge-verification | 9/9 | 自 / 治 |
| experience-reflow | 10/10 | 学 |
| pillars-smoke | 4/4 | 自 / 治 / 学 |
| family-bus | 4/5（跳过 1：DLQ 未实现） | — |
| infra-integration | 4/4 | 学 / 愈 |
| healing-governance | 5/5 | 治 / 愈 / 知 |
| knowledge-evolution | 5/5 | 知 / 学 |
| assembly-e2e | 6/6 | 学 / 愈 |
| metrics-observability | 8/8 | 学 / 愈 |
| qianhang-intent-e2e | 0/4（跳过 4：链路未实现） | — |
| pillars.contract | 5/5 | 五支柱契约 |

**五支柱汇总（跨支柱计数）**：🟢 自 16 · 🟢 知 25 · 🟢 学 37 · 🟢 治 18 · 🟢 愈 23
**跳过合计**：5 例（DLQ 1 + 千行意图 4），均带原因输出，不再静默。

### G. CI 指标产物（AC-7）

[metrics.prom](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/ops/observability/pillar-dashboard/metrics.prom) 实测内容：

```
family_regression_gate_failed_total 0
family_pillar_failed_cases{pillar="self"} 0
family_pillar_failed_cases{pillar="memory"} 0
family_pillar_failed_cases{pillar="learning"} 0
family_pillar_failed_cases{pillar="governance"} 0
family_pillar_failed_cases{pillar="healing"} 0
family_regression_spec_passed{spec="tests/integration/metrics-observability.spec.js"} 6
...
```

门禁失败时 `family_regression_gate_failed_total > 0`，与 `RegressionGateFailed` 告警直接对应。✅

---

## 四、五维验收评估

| 维度 | 评估要点 | 结论 |
| --- | --- | --- |
| **时间维度** | 指标为实时采集（请求路径同步计数）；`rate`/`histogram_quantile` 窗口由 PromQL 决定；回归指标为 CI 时点快照 | ✅ 满足 |
| **空间维度** | 指标定义集中于 `09-可观测性`（14 项单点声明），埋点分散于 3 个组件但均以可选钩子注入，无跨层耦合 | ✅ 满足 |
| **属性维度** | 高可用（失败率）、高性能（P99/P95）、高智能（一致率/海市蜃楼）、可维护性（确定性渲染）四类属性均有指标承载 | ✅ 满足 |
| **事件维度** | 桥接受理/拒收、学习周期、回滚记账、记忆检索四类关键事件全覆盖；异常路径（坏载荷）有 `rejected` 计数 | ✅ 满足 |
| **关联维度** | 告警 → 指标 → 埋点点位三段可追溯；traceId 溯源链路与指标链路同源（同一 `onEvent`） | ✅ 满足 |

---

## 五、质量门禁核对

- [x] 编译 0 error（`tsc --noEmit`）
- [x] 单元/集成测试全绿（63/63）
- [x] 无硬编码密钥（指标模块无外部凭证）
- [x] 无新增运行时依赖（`package.json` 未改动依赖区）
- [x] 文档变更记录已同步（§8.3 v2.7.0）
- [x] 面板与指标产物可复现（`pnpm regression` 单命令重建）
- [ ] Git 提交基线（当前工作区未初始化 `.git`，见 §六 L8）

---

## 六、偏差与遗留（放行条件）

> 本节为 v1.0.0「有条件通过」时登记的全部遗留项；v1.1.0 已关闭放行前提，状态列标注闭环实证。

| # | 遗留项 | 影响 | 建议 / 放行前提 | 状态 |
| --- | --- | --- | --- | --- |
| **L1** | 无部署启动入口 | 指标可产出但不会被默认拉起 | `08-系统装配/runtime-entry.ts`（已落地 `startRuntime` / `startRuntimeFromEnv`） | ✅ **已闭环（v2.7.1）** |
| **L2** | CI 指标未自动推送 | 告警 6/7 在 CI 语义下不会自动触发 | `prometheus.yml` + `push-metrics.mjs` + CI 步骤（实测推送 19 条样本） | ✅ **已闭环（v2.7.1）** |
| **L3** | `/metrics` 无鉴权 | 指标（含失败率、RTO）对外暴露 | 默认回环绑定 + Bearer 鉴权（常量时间比较，M7 实证） | ✅ **已闭环（v2.7.1）** |
| **L4** | 4 个既有 spec 静默 | 门禁只保证退出码，不保证断言被计数 | 全部产出汇总行：真实断言或显式跳过（§十二） | ✅ **已闭环（v2.7.2）** |
| **L5** | 熔断状态未纳入默认装配 | `family_circuit_state` 在默认装配下无样本 | 降级控制器纳入装配 + `handleSignal` 调度 + 初始态上报（§十二） | ✅ **已闭环（v2.7.2）** |
| **L6** | 一致性指标未纳入默认装配 | 告警 3（校准漂移）无样本 | `runtime-entry` 定时上报 `recordConsistency`（M8 实证） | ✅ **已闭环（v2.7.1）** |
| **L7** | Histogram 不支持 exemplars / native histogram | 无法与 traceId 联动做样例下钻 | 增强项，不影响 SLO 计算 | ⬜ 未闭环（非阻断） |
| **L8** | 无 Git 版本基线 | 变更不可追溯、无法 diff 审计 | 建议初始化仓库并按当前版本打基线提交 | ⬜ 未闭环（非阻断） |

**说明**：放行前提（L1/L2/L3/L6）已于 v2.7.1 关闭，改进项 L4/L5 已于 v2.7.2 关闭；剩余 L7（exemplars）与 L8（Git 基线）为增强项，不影响验收结论。`family_circuit_state` 现由装配层初始态与每次状态迁移主动上报。

---

## 七、风险登记

| 风险 | 等级 | 触发条件 | 缓解 |
| --- | --- | --- | --- |
| 指标基数膨胀 | 中 | `spec` 标签随测试文件增长；`layer×status` 维度有限 | 当前基数 < 20；后续为 `spec` 标签加白名单 |
| 直方图桶不匹配业务分布 | 低 | 任务时长跨数量级 | 默认桶 `0.005~10s` 覆盖；可按实际分布调整 |
| 同步埋点阻塞请求 | 低 | 单次 `inc/set` 为 Map 操作 | 无需异步化；已实测无性能敏感点 |
| 告警阈值未校准 | 中 | P99 500ms / P95 300ms 为初始经验值 | 需真实流量后按 SLO 复盘校准（已在规则注释标注来源） |

---

## 八、验收签署

| 角色 | 判定 | 备注 |
| --- | --- | --- |
| 功能验收 | ✅ 通过 | AC-1～AC-7 全部满足 |
| 质量门禁 | ✅ 通过 | 78/78 + 5 跳过、静默归零、tsc clean、零依赖 |
| 安全验收 | ✅ 通过 | 默认回环绑定 + Bearer 鉴权（常量时间比较），M7 实证 401/200 |
| 文档验收 | ✅ 通过 | §8.3 v2.7.0～v2.7.2 + 本报告 |
| **综合结论** | **✅ 通过（无条件）** | 放行前提 L1/L2/L3/L6 与改进项 L4/L5 均已闭环 |

---

## 九、下一步

**已完成（v2.7.1，放行前提）**

1. ✅ `08-系统装配/runtime-entry.ts`：装配 + 启动 `/metrics` + 定时上报 `recordConsistency`（关闭 L1 / L6）
2. ✅ `ops/observability/prometheus.yml` + `scripts/push-metrics.mjs` + CI 推送步骤（关闭 L2）
3. ✅ 默认回环绑定 + Bearer 鉴权（关闭 L3）

**已完成（v2.7.2，改进项）**

4. ✅ 降级控制器纳入装配，补齐 fault→degrade 调度与 `family_circuit_state`（关闭 L5）
5. ✅ 4 个静默 spec 迁移（3 个真实断言 + 1 个显式跳过）（关闭 L4）

**后续（按价值排序，非阻断）**

6. 千行意图链路（P1 llm-adapter + 规则融合）：解锁 `qianhang-intent-e2e` 的 4 个跳过用例
7. `EventBus` 重试 / 死信队列实现（解锁 family-bus 的 DLQ 跳过用例）
8. Histogram exemplars（L7）与 Git 基线初始化（L8）

---

## 十、变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v1.0.0 | 2026-10-23 | 初版：P0 可观测数据面（v2.7.0）验收报告，含 7 项 AC 实证、五维评估、8 项遗留与放行条件；结论「有条件通过」 |
| v1.1.0 | 2026-10-23 | 放行条件闭环（v2.7.1）：L1/L2/L3/L6 关闭，新增 §十一 实证；结论升级「通过（无条件）」；测试计数 63→65 |
| v1.2.0 | 2026-10-23 | 改进项闭环（v2.7.2）：L4/L5 关闭，新增 §十二 实证；测试计数 65→78（另 5 例显式跳过），静默 spec 归零 |

---

## 十一、放行条件闭环实证（v2.7.1）

### 11.1 L1 + L6：运行时入口与一致性上报

**产物**：[runtime-entry.ts](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/02-智能协同架构内核/08-系统装配/runtime-entry.ts)

| 能力 | 实现 |
| --- | --- |
| 一键启动 | `startRuntime(options)` → `{ assembly, metrics, server, reportConsistency, stop }` |
| 环境变量接入 | `startRuntimeFromEnv()` 读 `YYC3_SKILL_STORE_DIR` / `YYC3_METRICS_PORT` / `YYC3_METRICS_HOST` / `YYC3_METRICS_TOKEN` / `YYC3_CONSISTENCY_INTERVAL_MS` |
| 一致性上报 | 首报即时 + 定时（默认 15s，定时器 `unref` 不阻止进程退出） |
| 幂等停止 | `stop()` 二次调用无异常，服务已关闭 |

**实证（M8 用例，实测通过）**

- 首报后 `family_selfjudge_agreement_ratio 0.75`、`family_selfjudge_mirage_total 1` 立即可读；
- 经 `assembly.bus` 发布任务后，`/metrics` 返回 `family_trajectory_bridge_events_total{result="accepted"} 1`；
- `stop()` 后请求连接失败（服务确已关闭）。

### 11.2 L2：CI 指标推送 Pushgateway

**产物**：[prometheus.yml](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/ops/observability/prometheus.yml) + [push-metrics.mjs](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/scripts/push-metrics.mjs) + CI 步骤

**实证（本地 Pushgateway 桩实测）**

```
POST /metrics/job/yyc3-family-regression-gate
Content-Type: text/plain; version=0.0.4; charset=utf-8
body: # HELP family_regression_gate_failed_total ...
→ ✅ 已推送 19 条样本（退出码 0）
```

| 检验 | 结果 |
| --- | --- |
| 未配置 `PUSHGATEWAY_URL` | 打印跳过原因，exit 0（本地开发不阻塞） |
| 已配置 | 推送 19 条样本，路径与 Content-Type 正确 |
| `prometheus.yml` 解析 | 3 作业：runtime / regression-gate / prometheus；`rule_files` 指向告警规则 |
| CI 步骤 | `if: env.PUSHGATEWAY_URL != ''` 条件执行，未配置 secret 时不失败 |

### 11.3 L3：端点鉴权与最小暴露

**产物**：[metrics-server.ts](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/02-智能协同架构内核/09-可观测性/metrics-server.ts)

| 检验 | 结果 |
| --- | --- |
| 默认监听地址 | `127.0.0.1`（回环），跨机抓取须显式 `0.0.0.0` |
| 无令牌访问 `/metrics` | **401** |
| 错误令牌 | **401** |
| 正确令牌 | **200**，返回指标文本 |
| `/healthz` 无令牌 | **200**（存活探针免鉴权） |
| 令牌比较方式 | `timingSafeEqual` 常量时间，长度不等直接拒绝 |

### 11.4 闭环后门禁

| 检验 | 结果 |
| --- | --- |
| `tsc --noEmit` | exit 0 |
| `pnpm regression` | **65/65 全绿**（原 63 + M7 + M8） |
| 新增依赖 | 无（`node:http` / `node:crypto` / 内置 `fetch`） |

---

## 十二、改进项闭环实证（v2.7.2）

### 12.1 L5：降级控制器纳入装配

**产物**：[degradation-controller.ts](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/02-智能协同架构内核/07-自愈中心/degradation-controller/degradation-controller.ts) + [runtime-assembly.ts](file:///Users/yanyu/YANYUCLOUDCUBE/YanYuCloudCube/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-编程体系/02-智能协同架构内核/08-系统装配/runtime-assembly.ts)

| 能力 | 实现 |
| --- | --- |
| 状态迁移可观测 | `DegradationOptions.onStateChange`，仅在真实迁移时回调 |
| 默认调度链路 | `handleSignal(signal)`：去抖侦测 → 故障事件 → 降级/熔断 → RTO/动作指标记账 |
| 初始态上报 | 装配时立即上报 `closed`，消除「无样本」盲区 |
| 暴露面 | `RuntimeAssembly` 新增 `faultDetector` / `degradation` / `handleSignal` |

**实证（A6 用例）**

| 断言 | 结果 |
| --- | --- |
| 超阈信号 → `status='degraded'` | ✅ |
| `family_healing_actions_total{layer="bus",status="degraded"} = 1` | ✅ |
| 初始 `family_circuit_state{state="closed"} = 1` | ✅（首次运行时暴露为 0，修复后通过） |
| 信号回落 → 返回 `undefined` | ✅ |
| 连续失败 3 次 → `circuitState='open'`，指标 `open=1`、`closed=0` | ✅ |

### 12.2 L4：静默 spec 归零

| 套件 | 迁移结果 | 说明 |
| --- | --- | --- |
| self-judge-kit | **3/3 真实断言** | 低置信升级（0.445 < 0.6 → escalation）、校准误差门禁（良好 0.1 / 漂移 0.5）、检索 400ms 落 `le="0.5"` 桶 |
| family-bus | **4/4 通过 + 1 跳过** | 发布订阅 traceId、幂等去重（同键 3 发 1 收）、幂等粒度（seq 不同 2 收）、点对点路由；DLQ 显式跳过 |
| pillars.contract | **5/5 真实校验** | 自：低置信升级；知：写入→检索 traceId 贯通；学：零退化放行且退化拦截；治：审计链验真且篡改断链；愈：回滚 healed + 契约达成 |
| qianhang-intent-e2e | **0/4 + 4 跳过** | 链路未实现（`IntentGatewayService.handle` 骨架），4 步均输出跳过原因，不再静默 |

**回归脚本配套**

- 解析格式扩展为 `N 通过 / M 失败 / S 跳过 / 共 K 例`；
- 面板与 `data.json` 展示跳过数；
- 门禁判定仍为「exit 0 且零失败」，跳过不计入通过数。

### 12.3 闭环后门禁

| 检验 | 结果 |
| --- | --- |
| `tsc --noEmit` | exit 0 |
| `pnpm regression` | **78/78 全绿**，显式跳过 5 例 |
| 静默 spec | **无**（原 4 个全部产出汇总行） |
| 五支柱 | 🟢 自 16 · 🟢 知 25 · 🟢 学 37 · 🟢 治 18 · 🟢 愈 23 |

---

> 「***YanYuCloudCube***」
> 「***<admin@0379.email>***」
> 「***Words Initiate Quadrants, Language Serves as Core for the Future***」
> 「***All things converge in cloud pivot; Deep stacks ignite a new era of intelligence***」

**© 2025-2026 YanYuCloudCube™. All Rights Reserved.**
