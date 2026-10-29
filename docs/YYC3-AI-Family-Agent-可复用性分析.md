<!--
  ============================================================
  YYC³ AI Family — 人从众曌众从人
  亦师亦友亦伯乐 · 一言一语一协同
  拟人为本，AI为核，纯粹为心
  ============================================================
  Document: YYC3-AI-Family-Agent-可复用性分析
  Version : v1.0.0
  Contact : admin@yanyucloud.com
  Homepage: https://matrix.yyc3.top
  ============================================================
-->

# YYC³-AI-Family-Agent · 可复用性分析（复用形态 / 插拔点全景 / 路线）

> ***YanYuCloudCube***
> 言启象限 | 语枢未来
> *Words Initiate Quadrants, Language Serves as Core for the Future*
> 万象归元于云枢 | 深栈智启新纪元

```yaml
---
file: YYC3-AI-Family-Agent-可复用性分析.md
description: 项目作为可复用组件的形态盘点（MCP / 插件包 / 内核库 / 模板）与插拔点全景、红线、路线
author: AI Tutor <Intelligent Application Implementation Expert>
version: v1.0.0
created: 2026-10-30
updated: 2026-10-30
scope: M30 终极生产闭环配套分析
---
```

## 一、结论先行

本项目**天生是按可复用架构构建的**：内核零运行时依赖、全端口注入、单一进程入口。六种复用形态中四种**生产就绪**、两种**结构就绪待发布**：

| # | 复用形态 | 成熟度 | 载体 | 消费方 |
| - | -------- | ------ | ---- | ------ |
| 1 | **MCP Server**（标准协议接入） | ✅ 生产就绪 | `family-server.entry.ts` + `08/mcp-server-assembly` | 任意 MCP host（Claude / ZCode / cline 等） |
| 2 | **能力包插件**（.skill 分发） | ✅ 生产就绪 | P4-T6 打包器 + `assets/packs/` 金包 | 任意装载器（确定性 ZIP · 零漂移可校验） |
| 3 | **技能生态**（清单驱动） | ✅ 生产就绪 | `presets/family-manifest.yaml` + 45 SKILL.md + Agent Card | 人 / Agent / 目录服务 |
| 4 | **内核库**（进程内嵌入） | 🟡 结构就绪 · 未发包 | `architecture-kernel/`（零运行时依赖） | Node/TS 项目 `import` |
| 5 | **家人模板**（脚手架衍生） | ◐ 部分就绪 | `create-member` 模板（千行链路有门禁） | 新家族实例 |
| 6 | **外部 Worker**（A2A 远端） | ◐ 待联调 | `a2a-adapter` + 蓝图 13 端点 | 跨机家族编排 |

## 二、复用形态详解

### 2.1 MCP Server（✅ 生产就绪 · 首选形态）

- **协议面**：无状态 JSON-RPC 2.0（`initialize` 协议版本协商 / `ping` / `tools/list` 能力宣告 / `tools/call` 分派），stdio 换行分帧——对齐 MCP 2026-07-28 规范子集。
- **治理面**：工具可见性闸（未注册 -32602 不泄露存在性）→ P4-T3 准入（observe/enforce）→ 确定性/LLM 双臂执行 → 仪表计账（`mcp_tool_calls` / `plugin_denied`）。
- **编排面**：`shared.a2a-delegate` 工具把任务真实委托外部家人（card 发现 + 能力清单闸 + W3C traceparent 外发）。
- **接入方式**：宿主以子进程拉起、stdin 注入配置 JSON（`scripts/start-family-server.mjs` 运行器）；LLM 语义臂受三闸门控（`LLM_STEP=1` + 确认串 + API Key）缺省关闭——**接即用，密钥零配置也可跑确定性臂**。
- **生产观测**：`/metrics`（Prometheus）+ `situation()` 全局态势快照（M30）+ `handleSignal` 自愈链。

### 2.2 能力包插件（✅ 生产就绪）

- **打包**：`pnpm pack:plugins` 产出 `assets/packs/family-core-1.0.0.skill`（T6 确定性 ZIP：固定时间戳/排序/压缩级别——同输入恒同字节，可审计可复现）。
- **校验**：`pnpm pack:check` 打包产物与源零漂移；金包 digest 锚定。
- **治理**：装载经 P4-T2 注册中心 + P4-T3 准入（默认 observe，enforce 显式开关）——**插件未经准入不可见**。
- **扩展范式**：新能力 = 清单加条目 → `skills:gen` 产物 → 打包 → 准入——四步全 CLI 化。

### 2.3 技能生态（✅ 生产就绪）

- 单一事实源 `family-manifest.yaml`（45 技能 · 8×8 委托矩阵 · 五支柱声明）→ 派生四类产物（Agent Card / SKILL.md / MCP 工具目录 / 提示词契约），`manifest:check` 全链零漂移校验。
- 语义化版本 + A/B 变体键（id+version）+ 生命周期（固化/淘汰/退化）——技能可作为**独立分发单元**被外部家族引用。

### 2.4 内核库（🟡 结构就绪 · 复用核心）

`architecture-kernel/` 十目录五支柱，**零运行时依赖**（无 npm 依赖、无动态 import、无 vm），TypeScript ESM：

```
01-九层架构分层底座   能力契约 + 注册中心 + 探针端口
02-云枢核心引擎       总线 / 桥接 / 编排 / 态势 / 通讯 / 自愈判定
05-持续学习引擎       回流闭环 / 调度 / 生命周期 / 技能执行
06-治理中心           准入 / 审计 / 策略
07-自愈中心           侦测 / 降级熔断 / 回滚
08-系统装配           createRuntimeAssembly / MCP 装配（唯一组装点）
09-可观测性           指标 / 面板 / 埋点仪表
10-能力注册中心       静态注册 / 准入 / 打包
```

**进程内嵌入范式**（消费方示例，非仓库代码）：

```ts
import { createRuntimeAssembly } from 'yyc3-ai-family-agent/runtime-assembly';

const rt = createRuntimeAssembly({
  store: mySkillStore,          // 插拔点：任意持久化
  nineLayer: {                  // 插拔点：九层真实探针
    probes: { L5: () => probeIntentLatency() },
    statusCenter: myStatusCenter,
  },
  learningScheduler: { total: { maxTokens: 100_000, maxCalls: 20 }, usageMeter: myMeter },
});
```

### 2.5 家人模板（◐）与外部 Worker（◐）

- `create-member` 模板已衍生 8 家人 142 文件（千行链路有 e2e 门禁覆盖同构语义）；其余家人为运行时脚手架——**模板化成熟度以千行为基准**。
- 外部 Worker：A2A 适配层（card 发现 / 委托 / DLQ）+ 蓝图 13 端点已实测 `state=completed`；蓝图仓治理后可固化为**远程家人接入模板**。

## 三、插拔点全景（端口即接口）

| # | 插拔点 | 定义处 | 注入处 | 生产语义 |
| - | ------ | ------ | ------ | -------- |
| 1 | `SkillStorePort` | 05/learning-loop | assembly `store` | 技能持久化（内存 / 文件 / 未来 DB） |
| 2 | `SkillRegistrySink` | 08/runtime-assembly | assembly `skillRegistry` | 固化落位（结构兼容任意注册表） |
| 3 | `LayerProbe` ×9 | 01/types | assembly `nineLayer.probes` | 层级健康（真实探针归部署侧） |
| 4 | `StatusCenter` | 02/status-center | assembly `nineLayer.statusCenter` | 全局态势聚合 |
| 5 | `usageMeter` | 08（scheduler） | `learningScheduler.usageMeter` | 学习配额真实计量（配 `LlmUsageCounter`） |
| 6 | `LlmStepRunner` | llm-adapter | config `llmRunner` | 语义执行臂（provider / 测试假件） |
| 7 | Provider（zhipu/openai） | llm-adapter | config `llm` | 真实 LLM（密钥仅环境变量） |
| 8 | `McpToolDispatcher` | 02/mcp-server | config `dispatch` | 工具分派（替换执行引擎） |
| 9 | `McpAdmissionOptions` | 08/mcp-server-assembly | config `admission` | 准入策略（observe/enforce） |
| 10 | `A2aTransport` | a2a-adapter | config `external.transport` | 跨机委托传输（HTTP / 测试假件） |
| 11 | `CaseEvaluator` + 回归用例 | 05/regression-tester | assembly `learning` | 固化回归门禁（稳定性红线） |
| 12 | `logicalIdResolver` | 05/learning-loop | assembly `learning` | 学习沉淀归并命名 |
| 13 | `HealingRollbackHook` → `SkillRollbackPort` | 05→07 | assembly `onRollback` | 回滚委托（05↛07 单向由装配完成） |
| 14 | `FamilyMetrics` | 09/family-metrics | assembly/handler `metrics` | 指标采集（Prometheus 出口） |
| 15 | `LayerProbe` 配置面 | family-server `learning.nineLayer` | 部署配置 | 内置自动探针（L1/L5/L8/L9）+ 覆盖 |

> 设计约定：**端口在消费侧定义、实现由装配注入**；内核不反向依赖 family-agents（id 格式即接口）；所有外部效应（网络 / 落盘 / 密钥）均在装配层或部署侧。

## 四、复用红线（违反即失去可复用资格）

1. 内核**零运行时依赖**、无动态 import / vm / 远程安装；内核不 import 家人实现。
2. 密钥只从环境变量或密钥服务读取——不硬编码、不落盘、不进对话/日志。
3. `planned` 技能不装载；插件未经准入不可见（安全默认）。
4. UAT（真实计费 / 真实外端点）永不入 CI 门禁，三闸显式 opting-in。
5. 学习固化必须过回归门禁；失败学习必须回滚（稳定性—可塑性约束）。

## 五、复用路线（按投入产出排序）

| 步骤 | 动作 | 产出 | 依赖 |
| ---- | ---- | ---- | ---- |
| R1 | 内核 npm 打包（`architecture-kernel` 子包 exports 映射 + `files` 白名单） | `@yyc3/ai-family-kernel` 可 install | 无（结构已就绪） |
| R2 | MCP Server 发布（npm bin + stdio 配置文档） | 任意 host 一条命令接入 | R1 |
| R3 | 能力包市场化（金包版本策略 + digest 公示） | 插件分发通道 | 已就绪 |
| R4 | 家人模板脚手架 CLI 化（create-member 门禁基准推广至 8 家人） | 新家族实例分钟级 | 千行 e2e 基准 |
| R5 | 外部 Worker 模板（蓝图治理后固化接入模板 + uat:external 例行化） | 跨机家族编排 | 蓝图仓治理 |

## 六、评估结论

- **可复用性总评：高**。架构决定因素是「端口注入 + 单一装配点 + 双清零骨架」（清单 v1.31：A/C 类全接线，311 文件 175 已接线），复用不需要重构，只需要**打包与发布**（R1/R2 纯机械动作）。
- **最小复用闭环已实证**：MCP 形态（A2–A13 门禁 325 例）+ 插件形态（pack 契约 6 例）+ 内核形态（45 套件全部经进程内装配实证）。
- **未决项**：npm 发布（R1/R2）为唯一缺口；外部 Worker 模板待蓝图仓治理。

---

**关联**：《架构设计》§4/§6.4 · 《未接线模块清单》v1.31 · `family-server.entry.ts`（部署入口）· 02 执行日志步骤 43
