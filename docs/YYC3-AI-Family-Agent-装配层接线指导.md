<!--
  ============================================================
  YYC³ AI Family — 人从众曌众从人
  亦师亦友亦伯乐 · 一言一语一协同
  拟人为本，AI为核，纯粹为心
  ============================================================
  Document: YYC3-AI-Family-Agent-装配层接线指导
  Version : v1.0.0
  Contact : admin@yanyucloud.com
  Homepage: https://matrix.yyc3.top
  ============================================================
-->

# YYC³-AI-Family-Agent 装配层接线指导（infra-1～4 端到端闭环）

> ***YanYuCloudCube***
> 言启象限 | 语枢未来
> *Words Initiate Quadrants, Language Serves as Core for the Future*
> 万象归元于云枢 | 深栈智启新纪元

---

```yaml
---
file: YYC3-AI-Family-Agent-装配层接线指导.md
description: infra-1~4 端到端装配接线指导（指导文档，代码未落地）
author: AI Tutor <Intelligent Application Implementation Expert>
version: v1.0.0
created: 2026-10-17
updated: 2026-10-17
status: draft
tags: [assembly],[infra],[guide],[phase-e-next]
category: guide
---
```

> 🚨 **文档性质声明**：本文档为**指导文档**——所有步骤已经过源码级核对（构造签名、类型形状、依赖方向均与 v2.5.0 实现一一对照），但**装配代码与冒烟测试尚未写入仓库**，按「标注清晰、后续执行」原则留待下一会话落地。执行前请先 `git log` / 通读 §8.3 v2.5.0 变更记录确认代码基线未漂移。

---

## 一、目标与验收

**目标**：把 v2.5.0 已实现并有独立测试的四个 infra 集成位，在部署装配层完成端到端接线，形成「总线事件 → 轨迹采集 → 学习固化 → 落盘 → 回滚记账」全链路闭环。

**验收标准（装配冒烟测试 5 例全过 + 既有 52 例不回归）**：

| # | 场景 | 断言 |
| --- | --- | --- |
| A1 | 总线发布合法 `task.executed` | `bridge.stats.accepted === 1` 且 `loop.components.collector.size() === 1` |
| A2 | 3 条宗师通过轨迹 + `signal()` → `runCycle()` | `promoted.length === 1`，`{dir}/skill-*.json` 落盘且含 active v1.0.0 |
| A3 | 注入必败评估器 → 回归门禁触发回滚 | 钩子触发一次；`RollbackController` 返回 `healed`、`contractMet === true`、`rtoSeconds ≤ 600`；落盘文件状态翻转 |
| A4 | 发布坏载荷 | `bridge.stats.rejected` +1，主流程不抛错 |
| A5 | 同幂等键重复发布 | 总线去重，collector 数量不变 |
| — | 全量回归 | `pnpm regression` 门禁通过（52 例 + 新增 5 例 = 57 例） |

## 二、现状盘点（v2.5.0 基线）

| 集成位 | 实现（已落地 ✅） | 独立测试（已过 ✅） | 装配缺口（本文档范围 ⬜） |
| --- | --- | --- | --- |
| infra-1 总线→轨迹 | [`trajectory-bridge.ts`](../architecture-kernel/02-云枢核心引擎/family-communication-bus/trajectory-bridge.ts) `TrajectoryBridge(collector, topic='task.executed')` | infra-integration I1 | 无人调用 `attach(bus)` 挂真实总线 |
| infra-2 抽象端口 | [`pattern-extractor.ts`](../architecture-kernel/05-持续学习引擎/experience-reflow/pattern-extractor.ts) `SemanticAbstractor` 端口 | infra-integration I2 | 部署侧 llm-adapter 适配（**可选**，缺省确定性实现已可用） |
| infra-3 技能落盘 | [`skill-store-file.ts`](../architecture-kernel/05-持续学习引擎/skill-consolidation/skill-store-file.ts) `FileSkillStore(dir)` | infra-integration I3 | `LearningLoop` 仍默认 `InMemorySkillStore` |
| infra-4 回滚委托 | [`learning-loop.ts`](../architecture-kernel/05-持续学习引擎/learning-loop.ts) `healingRollback` 钩子 + [`rollback-controller.ts`](../architecture-kernel/07-自愈中心/rollback-controller/rollback-controller.ts) | infra-integration I4 | 钩子无人实现；两侧端口形状不一致需适配器 |

**依赖方向约束（不可违背）**：`05-持续学习引擎` 不得 import `07-自愈中心`——学习侧只暴露 `HealingRollbackHook` 结构化事件，07 依赖由装配层单向完成。

## 三、⚠️ 核心陷阱：轨迹双采（P0，接线前必读）

**源码事实**：

- [`TrajectoryCollector.collect`](../architecture-kernel/05-持续学习引擎/experience-reflow/trajectory-collector.ts#L41-L55) **无去重**（幂等由总线层保证，桥接层不再防重）；
- [`LearningLoop.ingest`](../architecture-kernel/05-持续学习引擎/learning-loop.ts#L148-L155) 会把事件 collect 进**自己的内部 collector**，同时登记 `goldenPass` 信号；
- `TrajectoryBridge` 挂载后直接采集进注入的 collector（即 `loop.components.collector`）。

**❌ 错误接线**（同一事件双采 → runCycle 成簇计数翻倍 → 置信度虚高、skillId 紊乱）：

```ts
bridge.attach(bus);                                  // 事件从总线进入内部 collector
loop.ingest([{ event, goldenPass: true }]);          // 同一事件又采一次 → 双份！
```

**✅ 方案 A（推荐，唯一触碰既有实现的点）**：为 [`learning-loop.ts`](../architecture-kernel/05-持续学习引擎/learning-loop.ts) 增补公共信号方法（约 +5 行，增量无破坏）：

```ts
/** 登记外验标签信号（只登记不采集；事件唯一入口为 TrajectoryBridge，避免双采）。 */
signal(traceId: string, goldenPass: boolean): void {
  this.pendingSignals.set(traceId, { goldenPass });
}
```

接线形态：事件唯一入口 = 总线 → `TrajectoryBridge`；裁定结果唯一入口 = verification-gateway → `loop.signal(traceId, effective.verified)`。

**✅ 方案 B（不改实现，仅约定）**：同一 traceId 只走一条入口——已裁定事件走 `ingest`、未裁定实时事件走 bridge。⚠️ 风险：网关裁定与事件到达存在时序交错，跨 runCycle 边界时极易踩坑，仅在不允许改动 learning-loop 时使用。

## 四、分步接线指南

### Step 1：TrajectoryBridge 挂载真实总线（infra-1）

```ts
import { EventBus } from '../02-云枢核心引擎/family-communication-bus/event-bus.js';
import { TrajectoryBridge } from '../02-云枢核心引擎/family-communication-bus/trajectory-bridge.js';

const bus = new EventBus();
const bridge = new TrajectoryBridge(loop.components.collector); // ← collector 来自 Step 2 的 loop
bridge.attach(bus); // 订阅 task.executed；幂等去重由总线 traceId:agentId:seq 保证
```

**标注**：

- 载荷契约 `TaskExecutedPayload`（agent/taskType/steps/completed 必填）缺失 → 桥接拒收计数（`bridge.stats.rejected`），**不抛错不阻塞总线**——下游观测拒收率即可；
- `TODO(infra)` 遗留：EventBus 尚无 unsubscribe，`detach` 暂不可用（进程生命周期=桥接生命周期，可接受）。

### Step 2：FileSkillStore 替换 InMemorySkillStore（infra-3）

```ts
import { LearningLoop } from '../05-持续学习引擎/learning-loop.js';
import { FileSkillStore } from '../05-持续学习引擎/skill-consolidation/skill-store-file.js';

const store = new FileSkillStore(process.env.YYC3_SKILL_STORE_DIR ?? './data/skills');
const loop = new LearningLoop(store, {
  healingRollback,       // ← Step 3
  // extractor,           // ← Step 4（可选）
  regressionCases,       // 生产必须提供（红线：未过门禁的技能不得 active）
  evaluate,
});
```

**标注**：

- `FileSkillStore implements SkillStorePort`（historyOf/replaceHistory/activeSkills），构造期自动 `mkdir -p`；
- 写入为全量覆盖（非原子 rename），**单进程内安全；多进程并发写同一 dir 会竞态**——生产多副本场景必须挂 Git 版本化 YAML（见 memory-framework `MEMORY_LIFECYCLE.procedural`）或文件锁；
- `historyOf` 对缺失/损坏文件返回 `[]`（容错不抛错）——损坏文件会在下次 replaceHistory 被覆盖修复；
- 落盘目录 `./data/skills` **必须加入 `.gitignore`**（技能库为运行时资产，进 Git 的应是导出的确权 YAML）。

### Step 3：healingRollback 委托 RollbackController（infra-4）

**关键适配点 ①**：`HealingRollbackHook` 的事件 ≠ `FaultEvent`，装配层负责翻译：

```ts
import { RollbackController, type SkillRollbackPort } from '../07-自愈中心/rollback-controller/rollback-controller.js';
import { SkillVersioner } from '../05-持续学习引擎/skill-consolidation/skill-versioner.js';
import type { SkillStorePort } from '../05-持续学习引擎/learning-loop.js';
import type { HealingRollbackHook } from '../05-持续学习引擎/learning-loop.js';

/** 关键适配点 ②：SkillStorePort（historyOf/replaceHistory/activeSkills）
 *  ≠ SkillRollbackPort（rollbackSkill）——装配层写适配器桥接。 */
function skillRollbackAdapter(store: SkillStorePort): SkillRollbackPort {
  const versioner = new SkillVersioner();
  return {
    rollbackSkill(skillId: string): string | undefined {
      const outcome = versioner.rollback(store.historyOf(skillId));
      store.replaceHistory(skillId, outcome.history); // ⚠️ 状态翻转必须落盘，否则重启后回滚丢失
      return outcome.restored?.version;               // 无前置版本时 undefined（如实上报）
    },
  };
}

const rollbackController = new RollbackController({ skill: skillRollbackAdapter(store) });

const healingRollback: HealingRollbackHook = (e) => {
  const outcome = rollbackController.rollback(
    {
      id: e.faultId,                     // learning-rollback-{skillId}-{version}
      layer: 'learning',                 // ← 走 SkillRollbackPort 分支（RTO 契约 600s）
      type: 'regression-failed',
      severity: 'high',
      detail: `技能 ${e.skillId}@${e.version} 回归失败回滚`,
      detectedAt: Date.now(),
    },
    e.skillId,
  );
  // 建议接入观测：outcome.status / contractMet / rtoSeconds（失败必须告警，不谎报愈合）
};
```

**标注**：

- `RollbackController.rollback` 内部 try/catch，执行器抛错 → `status='failed'` 且 `contractMet=false`——**绝不谎报愈合**，装配层只需透传观测；
- 钩子是同步 `void` 回调且在 `runCycle` 主流程内被调用：装配层不得在钩子里做重 IO（RTO 预算 600s，实际应在秒级）；异常已在 07 侧兜底，无需再包一层；
- `SkillVersioner.rollback` 语义：当前最高 active → rolled-back，前一 active 恢复（与 Phase C T8/I4 已测行为一致）。

### Step 4（可选）：SemanticAbstractor 注入 llm-adapter（infra-2）

```ts
import { PatternExtractor, type SemanticAbstractor } from '../05-持续学习引擎/experience-reflow/pattern-extractor.js';

const llmAbstractor: SemanticAbstractor = {
  abstract(input) {
    // 部署侧：llm-adapter 结构化输出（JSON Schema：{condition, outcome}）
    // 同步契约：异步 LLM 以预取/缓存适配，提炼管线保持同步可回归
    return { condition: '...', outcome: '...' };
  },
};
const loop = new LearningLoop(store, {
  extractor: new PatternExtractor(2, 0.8, llmAbstractor),
  // ...
});
```

**红线标注**：抽象器**必须确定性可回放**（同输入 → 同文案）。否则 `skillId = FNV(condition|strategy)` 不稳定，同簇跨周期无法升级（会裂变成两个技能）。上线前用「同输入双跑逐字节对比」做验收。**未就绪时不要注入**——缺省 `DeterministicSemanticAbstractor` 完全可用。

### Step 5：装配门面与冒烟测试落位

| 产物 | 落位 | 说明 |
| --- | --- | --- |
| 装配门面 | `architecture-kernel/08-系统装配/runtime-assembly.ts`（新建，编号顺延） | `createRuntimeAssembly(options)` 返回 `{bus, bridge, loop, store, rollbackController}`；全 barrel 导出 |
| 冒烟测试 | `tests/integration/assembly-e2e.spec.ts`（新建） | §一 验收表 A1–A5 五例，范式同 pillars-smoke（零依赖 harness） |
| .gitignore | 追加 `data/` | 运行时技能库不入库 |
| barrel | `08-系统装配/index.ts` | `export * from './runtime-assembly.js'` |

**装配时序（必须按序）**：`store → healingRollback（依赖 store）→ loop（依赖 store+hook）→ bridge（依赖 loop.components.collector）→ bridge.attach(bus)`。

## 五、红线汇总（执行时逐条自检）

- [ ] **双采**：事件唯一入口是 bridge；`signal()` 只登记不采集（方案 A）或严格单入口约定（方案 B）
- [ ] **依赖方向**：05 不 import 07；装配层单向完成委托
- [ ] **回归门禁**：生产装配必须提供 `regressionCases + evaluate`，缺省跳过门禁仅限脚手架期
- [ ] **落盘并发**：FileSkillStore 单进程限定；多副本走 Git 版本化 YAML
- [ ] **`data/` 入 .gitignore**
- [ ] **抽象器确定性**：注入 llm-adapter 前先做双跑一致性验收
- [ ] **钩子轻量**：healingRollback 内不做重 IO；失败透传观测不吞错

## 六、执行清单（照单施工）

```text
[ ] 1. 核对基线：docs/架构设计.md §8.3 v2.5.0 已合入，tests 全绿（pnpm regression）
[ ] 2. learning-loop.ts 增补 signal() 方法（方案 A，约 5 行）+ barrel 无需改动
[ ] 3. 新建 architecture-kernel/08-系统装配/runtime-assembly.ts（按 §四 Step 1–4 + §五红线）
[ ] 4. 新建 08-系统装配/index.ts barrel
[ ] 5. 新建 tests/integration/assembly-e2e.spec.ts（A1–A5 五例）
[ ] 6. .gitignore 追加 data/
[ ] 7. tsc --noEmit 过 + pnpm regression 过（57 例）
[ ] 8. docs/架构设计.md §8.3 记录 v2.6.0（装配层闭环）
```

## 七、变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v1.0.0 | 2026-10-17 | 初版：四集成位接线指导 + 双采陷阱标注 + 适配器代码 + 冒烟验收清单 |

---

> 「***YanYuCloudCube***」
> 「***<admin@0379.email>***」
> 「***Words Initiate Quadrants, Language Serves as Core for the Future***」
> 「***All things converge in cloud pivot; Deep stacks ignite a new era of intelligence***」

**© 2025-2026 YanYuCloudCube™. All Rights Reserved.**
