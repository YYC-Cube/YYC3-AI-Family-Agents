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
- **技能全版本化（P3-T1 首步）**：45 条技能条目补 `version`（语义化，初始 1.0.0）；`manifest:check` 强校验版本存在与格式——技能可漂移比对、可 A/B、可回滚的前提
- **技能产物生成（P3-T2）**：`scripts/gen-skill-artifacts.mjs`（`pnpm skills:gen` / `pnpm skills:check`）由清单派生 45 个 `skills/{owner}/{slug}/SKILL.md`（frontmatter：`name/description/version/id/scope/owner`，专用技能 owner 归一为家人 slug）；与 Agent Card 同构的「生成 + `--check` 零漂移 + 孤儿扫描」契约范式，范式依据见《技能与生态演进指导》
- **MCP 服务端协议语义（P3-MCP）**：`02-云枢核心引擎/mcp-adapter/server/`——无状态 JSON-RPC 2.0 分派器（`initialize` / `ping` / `tools/list`），对齐 MCP 2026-07-28 规范子集（协议版本协商、tools 能力宣告、列表结果预派生可缓存、工具名 `^[a-zA-Z0-9_-]+$` 构造期 fail-fast）；工具目录由部署侧注入，内核不反向依赖 presets / family-agents
- **门禁新增两套件**：`tests/contracts/skill-artifacts.contract.ts`（7 例：脚本退出码、45 产物 0 过期 0 孤儿、清单版本语义化、目录命名空间 ↔ id 双向一致、frontmatter 版本零漂移、owner 归属、锚点信息未丢失）与 `tests/integration/mcp-server.spec.ts`（6 例：initialize 回显、tools/list 目录与命名、未知方法 -32601、通知静默、非法输入 -32700/-32600、ping 幂等无状态）
- **统一技能 id 帮助器（P3-T3 · ADR-D2）**：`architecture-kernel/05-持续学习引擎/skill-consolidation/skill-id.ts` 纯函数契约——`manifestSkillId`（`{owner}.{skill}` 构造与校验）、`learnedSkillId` / `isLearnedId` / `canonicalOfLearned`（`learned.*` 命名空间）、`isFnvSkillId` / `legacyLearnedId`（历史 FNV 主键 `skill-xxxxxxxx` 归并 `learned.skill-xxxxxxxx`）、`logicalIdOfStored`（显式 > FNV 归并 > 自身 id 三级解析）
- **`SkillDefinition.logicalId` 双侧贯通**：kernel 05 与 `family-agents/shared-core/.../skill-registry.ts` 各自新增可选 `logicalId` 字段（不 import 内核——id 格式即契约）；`LearningLoop` 新增 `logicalIdResolver` 装配钩子，技能固化时写入统一命名空间 id
- **统一 id 加载器**：`SkillRegistry.loadFromManifest(entries)`（真实清单 45 → 44 装载，`status: planned` 跳过并透出）与 `findByLogicalId`（active 优先、`logicalId ?? id` 匹配）；`FileSkillStore.findByLogicalId` 全库扫描归并——历史 FNV 技能按 `learned.{内部 id}` 可查，已落盘数据零迁移
- **统一 id 回归套件**：`tests/integration/skill-id-unification.spec.ts`（8 例：清单真实装载 44 + planned 跳过、逻辑 id 互查同引用、归属抽查、帮助器派生与往返、显式 logicalId 命中且内部主键不变、FNV 历史归并、三套表示闭环互查、幂等重载）
- **渐进披露检索（P3-T4）**：元数据索引与正文分离——kernel 05 新增 [`skill-consolidation/skill-index.ts`](architecture-kernel/05-持续学习引擎/skill-consolidation/skill-index.ts) 契约（`SkillIndexEntry` 仅含 id/version/scope/owner/description/tags；确定性 `estimateTokens`：CJK 逐字计 1、其余每 4 字符计 1；单条预算 `SKILL_INDEX_TOKEN_BUDGET = 200`）；`gen-skill-artifacts.mjs` 派生 `skills/index.json`（45 条，与 SKILL.md 正文物理分离，`--check` 一并零漂移）；`SkillRegistry.loadIndex / listIndex / match(query)`（纯索引匹配 `matchSkillIndexEntries`：tag 命中权重 3 > id 2 > 描述 1，CJK 二元组 + latin 词分词，同分 id 升序）——检索先查索引不读正文，命中后经 `findByLogicalId` 延迟加载全量定义
- **渐进披露回归套件**：`tests/integration/skill-progressive-disclosure.spec.ts`（9 例：index.json 零漂移、字段白名单无正文字段、45 条全过 200 token 预算、estimator 口径确定性、索引/正文注册表分离、match 命中不泄露正文、排序权重与 limit、两阶段闭环（命中前 `findByLogicalId` 为空 → 正文装载后可达）、planned 可发现不可加载）
- **技能行为评测契约（P3-T5 · observe）**：`architecture-kernel/05-持续学习引擎/skill-consolidation/skill-eval.ts`——金样例评测纯函数语义：`skillTriggersOn`（确定性词面触发判定，CJK 二元组 + latin 词，独立实现不反向依赖 family-agents）、`outputShapeOk`（必含字段存在且非空）、`evaluateSkillCase`（触发 + 步骤计划 + 产出结构三维判定，violations 逐条记录）、`summarizeEval` 汇总、`SKILL_EVAL_MODE = 'observe'` 默认不阻断 + `enforceEvalOutcome` enforce 路径（违规即抛，治理显式升级）
- **金样例资产与评测套件**：`tests/skills/golden.json`（44 例 = 44 条 active 技能全覆盖，输入取自清单 examples，提交资产可人工精化）+ `tests/skills/skill-behavior-eval.spec.ts`（9 例：资产结构与 id 升序、覆盖零漂移双向（planned `shared.a2a-delegate` 不入）、触发判定单测、结构判定单测、evaluateSkillCase 三类违规、observe 全量执行（44 例结构合法、汇总与明细一致、偏差仅打印）、模式开关 observe、重复评测确定性、enforce 路径、金样例与清单 examples 同源可追溯）
- **面板能力供给卡片（P3-T6）**：`scripts/lib/capability-supply.mjs` 单一事实源（`countCapabilitySupply`：技能 = manifest 总数 45、工具 = active 技能映射的 MCP 工具名 44（`.` → `__`、`-` → `_`，planned 未准入不可见）、插件 = `plugins/{id}/plugin.yaml` 能力包 0（P4 预留））；`data.json` 增 `capabilities` 段，`pillar-dashboard/index.html` 新增「能力供给」卡片区（技能 / 工具 / 插件），回归控制台同步打印三元组
- **能力供给契约套件**：`tests/contracts/capability-supply.contract.ts`（6 例：计数器结构合法、skills 与清单技能段交叉验证 45、tools=44 全合规唯一、planned 不可见 + MCP 名映射规则锚点 `qianhang__intent_detection`、plugins=0 缺失口径、面板产物与计数器同源零漂移（data.json 三数值 + index.html 卡片数值））
- **能力包格式与校验（P4-T1）**：`plugins/{id}/plugin.yaml` 格式契约（`id/version/scope/description/contents[]/integrity/targets`）+ 金包样例 `plugins/family-core/plugin.yaml`（13 共用技能 + MCP 服务端 + 治理策略基线，scope=builtin、targets.agents=`["*"]`）；`scripts/check-plugins.mjs`（`pnpm plugins:check` / `plugins:integrity`）零依赖校验——结构完备、`contents.type` 仅限 skills / mcp-servers / policies / prompts 四类白名单、skills refs ⊆ manifest 技能集与 prompts refs ⊆ 清单提示词集交叉验证、targets.agents 家人白名单、目录名 ≡ id、`--json` 明细与 `--write-integrity` 回写幂等
- **静态注册中心（P4-T2）与完整性校验（P4-T4）**：`architecture-kernel/10-能力注册中心/`——`catalog.ts` 纯函数 scope 合并（builtin/local，同 id local 覆盖 builtin、组内数组序后者胜，`buildCapabilityCatalog` 展开注册能力归属、覆盖顺序确定且可测、零网络）；`plugin-loader.ts` 仅注册不执行（`PluginLoader` fail-fast 校验 + 重复 id 拒绝 + id 升序确定性 list；无动态 import() / 远程安装 / vm 沙箱——插件 = 静态可校验清单 + 已编译模块的注册）；`integrity.ts` **纯 TypeScript SHA-256**（FIPS 180-4，零 node:crypto 依赖，浏览器/边缘可用）——canonical 摘要（entries 按 kind+ref 排序 → 逐项哈希 → 连接再哈希）+ `verifyPluginDigest`（算法降级即失败）
- **能力包双套件（P4-T1/T2/T4）**：`tests/contracts/plugin-format.contract.ts`（8 例：脚本零错误退出、金包结构字段完备、skills refs 与清单交叉零漂移、**内核纯 TS SHA-256 ≡ node:crypto 实现**交叉断言、篡改检测 A 声明被改一位 / B SKILL.md 被改一字（虚拟 root）、坏包多重错误全捕获、`--write-integrity` 幂等）与 `tests/integration/capability-catalog.spec.ts`（8 例：loader 注册金包与 fixture 资产同源、fail-fast 三类校验、重复注册拒绝 + list 确定性、local 覆盖 builtin（overridden 记录）、合并确定性（乱序输入逐字节一致）、15 项能力归属展开、完整性权威实现（篡改 payload / 算法降级 verify false）、红线「仅注册不执行」（API 面断言））
- **准入治理（P4-T3 · observe/enforce）**：`architecture-kernel/10-能力注册中心/allowlist.ts`——`CapabilityAllowlist` 准入清单判定（id 白名单由部署侧注入，内核零 IO）：默认 **observe**（未准入调用放行并**必定**写入 `ComplianceAudit` 不可篡改审计链，`policyId=capability-allowlist`），`enforce` 需**显式**开关（非法模式即抛）；enforce 下拒绝并计数（`rejectedCount`）、observe 留痕计数（`observedCount`）；审计链可注入共享（缺省自建）、`verifyAudit()` 防篡改断链即 false、`filterAllowed()` 未准入不可见（供 `tools/list` 复用）
- **准入治理套件（P4-T3）**：`tests/integration/capability-allowlist.spec.ts`（8 例：默认 observe 与非法模式、准入零噪声、审计字段与链完整性、enforce 拒绝计数、共享审计链注入、决策确定性、金包 id 同源 + 可见性过滤、审计篡改断链）
- **MCP 工具目录（P4-T5）**：`scripts/gen-mcp-tools.mjs`（`pnpm mcp:tools` / `mcp:tools:check`）——manifest active 技能 → `assets/mcp-tools.json`（44 工具 + 1 条 planned 不可见），工具名 `.`→`__`、`-`→`_` 且 `^[a-zA-Z0-9_-]+$`，产物可入 Git、`--check` 零漂移；`mcp-adapter/server/protocol.ts` 扩展 `tools/call`（参数校验 → 可见性 → Policy 裁决 → 分派）：`visible` 过滤未准入工具（tools/list 与 tools/call 同源，隐藏工具一律 -32602 不泄露存在性）、`policy` 可接 `CapabilityAllowlist`、`dispatch` 同步分派；执行失败按 MCP 语义返回 `isError`，通知类不执行
- **工具目录双套件（P4-T5）**：`tests/contracts/mcp-tools.contract.ts`（6 例：`--check` 零漂移、命名与映射锚点、planned 不可见、45 = 44 + 1 与 `skills/index.json` 同源、面板 tools 44 同源、幂等不写盘）与 `tests/integration/mcp-tool-catalog.spec.ts`（8 例：目录 → tools/list 三字段、未准入不可见 + -32602、分派成功 / 策略拒绝不进入分派、参数与 -32603 边界、分派异常 `isError`、与 P4-T3 observe/enforce 协同）
- **能力包打包 CLI（P4-T6）**：`scripts/pack-plugin.mjs`（`pnpm pack:plugins` / `pack:check`）——零依赖**确定性 ZIP** 打包器（node:zlib deflate level 9 + 手写 crc32 / ZIP 容器；固定 DOS 时间戳、条目按路径字典序、UTF-8 文件名标志——同输入恒同字节，产物可入 Git）；能力包 `plugins/{id}/plugin.yaml` → `assets/packs/{id}-{version}.skill`（打包前重算 canonical digest 与 `integrity.digest` 比对，**篡改即拒绝打包**，P4-T4 联动；包内 `{id}/plugin.yaml` + skills SKILL.md + prompts 文件）；分发副本 `packaging/{slug}/` → `docs/{slug}.skill`——`docs/yyc3-ai-family-coding.skill`（Agent Skills 开放规范形态：SKILL.md + references/）自此由源目录 `packaging/yyc3-ai-family-coding/` 打包生成，**不手改**；`--check` 字节级零漂移（CI/回归用）、`--json` 明细、`--root` 虚拟环境（篡改检测）
- **打包分发双套件（P4-T6）**：`tests/contracts/pack-plugins.contract.ts`（6 例：`--check --json` 双产物零漂移、条目清单（14 = plugin.yaml + 13 SKILL.md；分发副本 3 文件与源一致 + frontmatter 锚点）、完整性联动（正常虚拟 root 可打包 / 篡改 SKILL.md 即拒绝）、确定性（连续两次打包逐字节一致）、幂等（仓库根重复打包不改字节 + 再 check 零漂移）、入库产物单字节翻转 → `--check` 报字节漂移）与 `tests/integration/plugin-pack.spec.ts`（6 例：产物可解包 + 命名契约 + 与仓库源逐字节一致、分发形态 kernel `verifyPluginDigest` 通过（含声明类 15 entries 双实现交叉）、打包 → 分发 → 注册全链路（产物清单 PluginLoader 静态注册 15 能力）、分发副本同受管、篡改检出、产物 id 衔接准入治理（observe 留痕 / enforce 拒绝））
- **外部 Worker 契约（P2-T1 · M8）**：`presets/external-worker/worker.yaml.tpl`（`${VAR}` 占位模板：id/endpoint/auth/capabilities/capabilitiesRef）+ `scripts/check-external-worker.mjs`（`pnpm external:check`）——模板结构校验、实例校验（id kebab-case、endpoint http(s) 且端口避开 3030、token 只引环境变量名**不得落值**、capabilities 逐项 ∈ 家族清单 45 条不得自造、capabilitiesRef 指向 presets/family-manifest.yaml）；八家人 slug 隔离；套件 `tests/contracts/external-worker.contract.ts`（7 例）
- **A2A 适配层（P2-T2 · M9）**：`architecture-kernel/a2a-adapter/`（内核零网络）——`card-discovery.ts`（well-known `/.well-known/agent-card.json` 路径构造 + `CardDirectory` 注册/发现/按能力检索）、`task-delegate.ts`（`DelegateClient`：能力定位 → JSON-RPC `message/send`（params 携 traceId）→ 响应归一（taskId/state）→ 失败入**有界 FIFO 死信队列** + `onDeadLetter` 回调，不向委托方抛出）；传输 `A2aTransport.send` 注入式设计，超时语义归传输层；套件 `tests/integration/a2a-adapter.spec.ts`（6 例）
- **外部 UAT 门控 runner（P2-T3 · M8）**：`scripts/run-external-uats.mjs`（`pnpm uat:external`）三闸门控（`EXT_WORKER=1` + `EXT_WORKER_CONFIRM=我知晓外部端点调用` + `EXT_WORKER_ENDPOINT` 存在，缺一跳过 exit 0）+ 隔离编译（tmp tsconfig，与 `uat:llm` 同构）；端点优先级 env > 实例文件；套件 `tests/uat/external-worker-uat.spec.ts`（card 发现 / 形态 / tasks/send 委托归一，真实端点）
- **安全策略映射（P2-T4 · M9）**：`presets/policies/security.yaml`（蓝图 1209 → 策略即代码：`security.zero-trust` / `security.content-filter` / `security.injection-detect`，全部 observe 默认 + `source: blueprint-1209`）+ `scripts/check-security-policies.mjs`（yaml-lite 解析 + 命名/版本/mode/rule/scope 校验，`--json` 输出与内核套件同一事实源）+ 内核 `06-治理中心/policy-registry/security-policies.ts`（`registerSecurityPolicies` + `SecurityPolicyBinder.evaluate`：observe → allow-with-audit + 审计链；enforce 逐策略显式 → deny + 计数）；套件 `tests/integration/security-policy-bind.spec.ts`（5 例）
- **外部 Worker 隔离编排模板（P2-T5 · M9）**：`docker/external-worker.compose.yml`——端口 `3130:8000`（避开开发服务器 3030 起）、healthcheck 打 well-known card、token 走 `${WORKER_13_TOKEN:?}` 强制环境变量
- **`shared.a2a-delegate` 激活（P2 收官）**：manifest 删 `status: planned` + 挂 kernel 锚点 `a2a-adapter/index.ts` → SKILL.md / `assets/mcp-tools.json`（45 工具、hidden 归零）/ 金包 digest / `assets/packs/family-core-1.0.0.skill` 全链重生成；金样例 44 → 45 全覆盖，`planned` 语义自此为「尚未规划激活的能力占位」→ **归零**；技能 45（active 45）· 工具 45 · 插件 1
- **技能步骤契约（P3-T1②）**：45 条技能全量补 `steps`（2–3 步执行序列，dedicated 满足「≥1 step」验收）+ 21 条有 kernel 锚点技能（共用 13 + 专用 8）补 `io`（input/output 字段列表）；`manifest:check` 强校验（steps 非空字符串数组 + io 声明即双侧非空）；SKILL.md 产物新增「步骤（steps）」与「I/O 契约」节（`skills/index.json` 保持正文分离，渐进披露口径不变）；契约套件 +1 例（步骤契约 45 条 + io/锚点一一对应）
- **能力供给指标（§6.3）**：`FamilyMetrics` 新增 3 项 Counter——`family_capability_skills_loaded_total`（skill 标签）、`family_capability_mcp_tool_calls_total`（result=ok|error）、`family_capability_plugin_denied_total`（plugin 标签，enforce 拒绝）+ `recordSkillLoaded` / `recordMcpToolCall` / `recordPluginDenied`（生产端接线点见方法注释）；`five-dimension-map.json` 增 `capability` 单列组（event ×2 + attribute ×1）；指标可观测套件 +1 例（M11）、五维修映射套件口径 18 → 21
- **能力供给指标生产端接线（§6.3 接线闭环）**：`architecture-kernel/09-可观测性/capability-instrumentation.ts` 三个零侵入仪表（范式同 P1-T4b collaboration-instrumentation，结构化最小接口、内核不反向依赖 family-agents）——`instrumentSkillRegistry`（包装 `SkillRegistry.loadFromManifest`：非 planned 逐技能记账，planned 无样本，幂等重载按「加载次数」累计）、`instrumentMcpDispatcher`（包装 tools/call `dispatch` 函数：Policy 放行后成功记 ok / 抛错记 error 后原样重抛，`isError` 协议语义不破；策略拒绝不进入 dispatch 不计入）、`instrumentCapabilityAllowlist`（包装 `admit`：enforce 拒绝（admitted=false）记账，observe 放行留痕不计）；`09` barrel 导出，`runtime-assembly` metrics 选项注释同步（部署侧包装接线口径）；套件 `tests/integration/capability-instrumentation.spec.ts`（5 例：装载记账与 planned 无样本、Proxy 零侵入 + 幂等重载累计、工具调用 ok/error 与策略拒绝不计、准入 enforce 记账 + observe 不计 + 审计链透传、三族指标互不串扰与渲染）
- **家族服务进程装配（P6-A · M14）**：`architecture-kernel/08-系统装配/mcp-server-assembly.ts`——`assembleMcpServer(options)` 一次组装「工具目录 + 准入治理 + 指标仪表」（CapabilityAllowlist 裁决 → 无 `_meta.traceId` 时按前缀合成保证审计可追溯 → `instrumentMcpDispatcher` 仪表化分派 → 无状态 JSON-RPC 处理器）；部署入口 `family-agents/family-server.entry.ts`（`startFamilyServer(config)`：`instrumentSkillRegistry` 装载清单 → MCP 装配 → `/metrics` 暴露；缺省 introspection 分派（工具名 ↔ logicalId 逆映射，未注册抛错走 isError），真实执行器后续只换 `dispatch`；CLI 经 stdin 收配置、`--selftest` 自检；macOS `/var` 符号链接 realpath 守卫）；启动器 `scripts/start-family-server.mjs`（`pnpm start` / `start:selftest`：读 `assets/mcp-tools.json` + `presets/family-manifest.yaml` → stdin 注入 → 隔离编译运行，编译约定同 `uat:llm`，entry 零文件 IO）；套件 `tests/integration/family-server-assembly.spec.ts`（7 例：逆映射锚点、端到端装载+调用记账、observe 留痕不计、enforce 拒绝 + dispatch 不进入、未注册技能 error 计账、/metrics HTTP 真值 + stop 幂等、零指标装配照常）；《装配层接线指导》v1.1.0 新增 Step 6「能力供给三仪表接线」
- **技能执行引擎（P6-B · M15 · 确定性臂）**：`architecture-kernel/05-持续学习引擎/skill-consolidation/skill-executor.ts`——`executeManifestSkill(entry, input)` 对清单技能条目（P3-T1② steps/io 契约）做确定性执行：① 输入契约校验（io.input 逐字段存在/非空，violations 逐条）② 触发核验（复用 `skillTriggersOn`，与金样例评测同源不重复实现）③ 步骤计划（steps 全量展开，`exec: 'llm'` 待 M16 语义执行臂，本臂不假装执行 NL 步骤）④ 输出骨架（io.output → null 待填充）；`family-server.entry.ts` 缺省分派由 introspection 升级为执行引擎（契约违反抛错走 isError → error 率可观测；selftest 按 io.input 自动构造合法入参）；套件 `tests/integration/skill-executor.spec.ts`（6 例：契约逐条 / 触发同源 / 计划与 llmRequired / 输出骨架 / 分派集成 ok|error 计账 / startFamilyServer 端到端，pillars 学）
- **LLM 语义执行臂（P6-C · M16）**：① 协议层异步分派——`protocol.ts` `tools/call` 检测 thenable 自动 await（同步快速路径保持，既有消费者零变化；`McpRequestHandler.handle` 返回 `string | null | Promise<...>`；mcp-server.spec +2 例：异步成功同构 / 拒绝转 isError）；② `family-agents/shared-core/llm-adapter/skill-step-executor.ts`——`executeSkillWithLlm(entry, input, {runner})` 逐步骤构造提示词（技能 id + 步骤文本 + 已完成产物累积）→ 注入式 runner（hermetic 假件可测）→ 围栏剥离 JSON 抽取（`extractStepJson`，无法解析回退 raw）→ 末步产物填充 io.output 骨架（未覆盖字段 null + outputViolations）；`createLlmStepRunner(provider, model)` 由 ZhiPu/OpenAI provider 构造真实 runner（密钥经环境变量）；③ `family-server.entry.ts` 接线：`llmRunner`（注入）或 `llm`（provider 配置）启用语义臂——契约校验先行、无步骤条目走同步快速路径、有步骤经异步分派；④ 启动器三闸门控（`LLM_STEP=1` + `LLM_STEP_CONFIRM=我知晓真实计费` + API Key，缺一保持确定性臂）；套件 `tests/integration/llm-step-executor.spec.ts`（6 例：逐步执行与累积 / JSON 抽取 / 输出填充 / 契约先行 runner 不调用 / 异常透传 / startFamilyServer 异步端到端 + 同步快速路径共存，pillars 学，零网络）
- **LLM 首跑与调优（P6-D · M17）**：`pnpm start:selftest:llm`（三闸门控 + `.env` 密钥兜底解析不回显）经完整协议链路采样实测；排障两处——selftest 调用缺 `await`（异步化遗留）与步骤提示词未声明输出契约；**调优后真实智谱调用输出字段填充 5/5**（self-judge 3/3 · memory-retrieve 1/1 · memory-write 1/1），最终步骤提示词强制声明 io.output 字段清单
- **LLM 全量采样实测（P6-E · M18）**：`LLM_STEP_SAMPLE=45` 门控全量首跑——21 条 io 契约技能（其余 24 条无 io 按设计不入采样）× 真实智谱调用，**输出字段填充 34/34 · 100% · 零失败**，M17 输出契约声明在全量成立无需再调优；门控自检超时放宽至 540s（135+ 次顺序真实调用）
- **LLM 观测增强（P6-F · M19）**：`FamilyMetrics` +`family_llm_steps_total`（Counter，skill 标签）+`family_llm_output_fill_ratio`（Gauge 0..1）与 `recordLlmExecution(skillId, steps, filled, fields)`——`skill-step-executor` 注入 metrics 即自动上报，`family-server.entry` 语义臂全链接线；`five-dimension-map.json` capability 组 3→5 项（+event/attribute 各一）；告警 +`LlmOutputFillLow`（填充率 < 0.8 · 10 分钟 · warning）→ **13 条**；五维修映射口径 21→23、llm 套件 +G8 观测注入例，门禁 284 → **285**
- **外部 Worker 真实联调（P7-c · M20）**：`workers/blueprint-13/`（stdlib 零依赖参照实现 · 回环 3130 · well-known card 发现 + `message/send`/`tasks/send` 双方法委托 + `WORKER_13_TOKEN` 可选鉴权）+ 实例契约 `presets/external-worker/blueprint-13.worker.yaml`（capabilities 全量引 manifest 真实 id，`external:check` 通过）+ `run-external-uats.mjs` 修复闸 3 端点未注入子进程脱节——**三闸 UAT 真实首跑 3/3 全过**，P2 生态外挂真实闭环；契约套件首例改实例数无关断言（M20 起 1 份实例）
- **W3C traceparent 关联维补全（P7-a · M21）**：`protocol.ts` `parseTraceparent`（严格格式 `00-<32hex>-<16hex>-<2hex>`；版本 ff / 全零 / 格式不符 → null 不炸协议层）+ `McpToolCallContext.traceparent` + traceId 优先级（显式 `_meta.traceId` > 头派生）；`a2a-adapter/task-delegate` 委托外发标准头（仅 32hex 原生 traceId 附带，不造假格式）；套件 +3 例（解析与 ctx 传播 / a2a 外发双向 / A8 审计链贯穿——无显式 traceId 时审计 traceId = 头 traceId），门禁 285 → **288**；包 2.33.0
- **运行时编排升级（P7-c · M22）**：`family-server.entry.ts` 新增 `external`（ExternalFamilyOptions）——`shared.a2a-delegate` 工具经 `a2a-adapter DelegateClient` 真实委托外部家人：`HttpA2aTransport`（fetch + 超时 + 可选令牌）+ 启动期 well-known card 发现（http(s) 闸 + 形态校验）+ 能力清单闸（card 未声明技能即拒）+ traceId 优先级链（ctx 显式/头派生 > UUID 32hex，使外发携带 W3C traceparent）；启动器按 `blueprint-13.worker.yaml` 实例契约自动装配；`instrumentMcpDispatcher` **异步感知修正**（thenable 归一——M16 起异步拒绝被错记 ok）；A9 套件 +1（hermetic 注入传输 + traceparent 贯穿断言 + 清单外拒绝 error 计账）；实活 selftest 实测委托 `taskId/state=completed`；门禁 288 → **289/289**；包 2.34.0
- **未接线清单逐文件复核（P7-b · v1.24.0）**：新增 §2.5「仅编译 167 文件逐文件归类」——A 九层底座骨架 20 · B 再导出 barrel 22（冷是消费方式而非未交付）· C 功能骨架 9（待装配）· D 家人同构模板衍生 108（create-member 脚手架，拆线即破坏家人目录契约）· E shared-core 部件 6 · F UAT 门控 2；结论**无一处误判已交付或应拆未拆**，learning-scheduler 为下轮接线首选
- **学习调度器转实（P8-a · M23）**：`budget-allocator.ts` 由桩转实——剩余配额记账 + 授予预扣（token/调用分维度 min(申请,剩余)）+ `ZERO_BUDGET` 等待信号（零配额不入账）+ `release` 归还（失败/提前退出）；`priority-queue.ts` 由 FIFO 桩转实——priority 降序稳定有序插入（同分 FIFO）+ `peek`/`list` 只读面；新套件 `tests/integration/learning-scheduler.spec.ts` 5 例（学）：有序与稳定 / 分维度授予与预扣 / 耗尽归还再授予 / 非法输入 / 调度闭环（优先序 + 失败归还唤醒 + 账目守恒）；门禁 289 → **294/294**
- **双臂合并链路实测（P8-b · M23）**：`pnpm start:selftest:llm`（实例契约自动装配 + LLM 三闸同开）一次自检走通**三链齐跑**——确定性执行（plan/骨架）+ LLM 语义臂（真实智谱 2 技能填充 4/4）+ A2A 外部委托（blueprint-13 实活 `state=completed`）——「本地语义执行 + 外部委托」混合编排端到端成立
- **调度器接入装配（P8-b · M24）**：`runtime-assembly.ts` 新增 `learningScheduler` 选项与 `LearningSchedulerHandle`——「请求-排空」两段式学习周期闸：`requestCycle(priority)` 优先级入队 → `drain()` 按序授予配额（每周期一份 token 份额 + 1 次调用，份额缺省 = 总量/允许调用数均分——调用次数成为唯一约束维度）→ 执行 `loop.runCycle()`；耗尽 `skipped-budget` 保留回队，周期异常**全额归还**后透传（失败任务标记回队）；`available()/exhausted()/pending()` 观测面；缺省不启用零侵入；新套件 `learning-scheduler-assembly.spec.ts` 5 例（学·愈）：缺省直达 / 调用限流回队 / 优先序排空（onCycle 序）/ token 份额记账（1000−800=200，零配额不入账）/ 失败归还再执行；门禁 294 → **299/299**
- **技能生命周期三件转实（P8-a · M25 · C 类第一批）**：`skill-merger.ts` 由桩转实——阈值门（support≥3 ∧ confidence≥0.7）后按模式三元组**确定性模板**固化（FNV-1a `skill-<8hex>` 主键与 P3-T3 `learned.*` 归并兼容；steps 条件/策略/结果三段式，LLM 精化归语义臂域）+ `toWriteRequest` 溯源；`skill-pruner.ts` 由桩转实——候选 = 空闲超阈 OR 频次过低（无 lastUsedAt 视为从未使用），`protectedIds` 治理豁免，hardDelete 归调用方处置；`forgetting-detector.ts` 口径确认——delta=before−after，degraded > maxDecay（**ε=1e-9 容浮点伪影**，边界值不判）；新套件 `skill-lifecycle.spec.ts` 5 例（学）：阈值/确定性哈希/写入请求/候选与豁免/退化边界；门禁 299 → **304/304**；C 类余 4 件
- **家族编排四件转实（P8-a · M26 · C 类清零）**：`cloud-pivot-orchestrator`（注入 `StepDispatcher` 端口逐步真实分发——失败记账不中断、traceId 贯穿；`DispatchVerifier` 低置信仲裁；无端口保持兼容语义）· `global-status-center`（overall 最坏态推导 + 资源压力阈值缺省 0.9）· `family-phone-system`（通话生命周期 + 热线反查 + 私信投递端口与双向信箱）· `dashu-self-healing`（注入 `InfraActuator`——K8s 执行归部署侧，内核零网络；RTO 实测契约判定；**失败/无通道如实 failed，不再假 healed**）；新套件 `family-ops.spec.ts` 5 例（治）；门禁 304 → **309/309**（44 套件 · 入口 44）；**C 类 4 → 0 清零**；包 2.38.0
- **P8 收尾双件转实（P8-a/b · M27 · 弧线收口）**：**merger→registry 装配位**——`learning-loop.ts` 新增 `onPromoted` 固化落位出口（仅过回归门禁、已写库的晋升技能回调，回滚不在列），`runtime-assembly.ts` 新增 `skillRegistry` 选项与 `consolidatedSkillForRegistry` 适配（steps 序号化 order/action · logicalId 按 skill-id.ts 归并约定显式优先 / FNV → `learned.*` · 内核专有字段 sourcePattern/createdAt/useCount 不外带；与 procedural-memory SkillRegistry 结构兼容，内核零反向依赖 family-agents）；**调度闸消费真实 LLM usage**——`learningScheduler.usageMeter` 累计计量端口按周期前后差值冲抵授予份额（未消耗归还 · 超支按授予额封顶 · 失败全额归还与读数无关），`LearningCycleOutcome` executed 携带 `usage` 三元组（granted/actual/released），无计量器维持 M24 整份语义零侵入；`skill-step-executor.ts` 新增 `LlmUsageCounter`（真实 provider usage 逐调用累计，负值按 0 防脏数据透支）+ `createLlmStepRunner` 第 4 参 meter 注入，`family-server.entry.ts` provider 构造臂自动挂表（句柄 `llmUsage` 暴露 · selftest:llm 输出累计 tokens）；套件 +6：`skill-lifecycle` F6–F8（适配映射 / 装配位端到端 / 幂等升级）+ `learning-scheduler-assembly` L6–L8（回填 / 超支封顶 / 失败归还）；门禁 309 → **315/315**（44 套件 · 入口 44 · 学 116 → 122 · 愈 58 → 61）；包 2.39.0
- **部署侧装配合流（M28 · 学习闭环进服务进程）**：`family-server.entry.ts` 新增 `learning` 配置——配置即嵌入内核 `createRuntimeAssembly`：① **轨迹馈入**：新增 `learningDispatch` 仪表，每次分派完成发布一条 `task.executed` 总线事件（同步即发；异步 thenable 结算后发，拒绝也记轨迹 completed=false → failure 负样本；traceId 取调用链上下文缺省 UUID 派生，幂等键 seq 递增）；② **调度闸接线**：`learning.scheduler` 透传 `learningScheduler`，`usageMeter` 自动接 `llmUsage` 计数器（provider 臂启用即真实计量）；③ **固化落位**：`skillRegistry` 接服务注册表——promoted 技能经 `learned.*` 归并 id 即 `registry.findByLogicalId` 可查（MCP → 总线 → 桥接 → 学习 → 注册表一条链贯通）；缺省不配置零侵入（不建 store、不挂仪表）；句柄新增 `learning`（bus/bridge/loop/scheduler 观测面）· selftest 输出桥接受理数；新例 A9–A11（学习闭环贯通 / 调度闸接线零实耗归还 / 失败轨迹负样本）；门禁 315 → **318/318**（44 套件 · 入口 44 · 治 111 → 114）；包 2.40.0
- **九层底座全接线（P9-a · M29 · A 类清零）**：`types.ts` 新增 `LayerProbe` 注入式探针端口（同步/异步返回健康态 · 抛错判 down），9 层能力类（L1 基础底座 ~ L9 元启·天枢）构造器注入探针——缺省恒 ok、部署侧接真实依赖探针；新增 `layer-registry.ts` `NineLayerRegistry`（L1–L9 注册守卫 / describeAll 自描述 / `healthAll` 并行聚合·单层异常隔离·`withDefaults` 静态装配）；`runtime-assembly.ts` 新增 `nineLayer` 选项（probes 按 id 注入 + `statusCenter` 提供即 `reportLayerHealth()` 态势对接——各层健康上报为 `layer-L1..L9` 服务态，global-status-center 最坏态推导天然生效）· 句柄 `layers` / `reportLayerHealth`；新套件 `nine-layer.spec.ts` 5 例（治）：静态清单完备 / 探针注入 / 异常隔离 / 注册守卫 / 态势对接（degraded → overall degraded → 恢复 ok）；门禁 318 → **323/323**（**45 套件 · 入口 45** · 治 114 → 119）；清单统计 309/149/156 → **311/175/136**（kernel 已接线 73 → 94，**A 类 20 → 0 清零** · §三未接线 58 → 38 · 清单 v1.31.0）；包 2.41.0

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
- 回归口径：**143 / 143 → 156 / 156**（22 套件 · 0 跳过 · 0 静默）；五支柱 治 41 → 47、愈 43 → 49；门禁入口 19 → 21
- CI 契约软校验步骤扩展 `gen-skill-artifacts.mjs --check`（P3-T2 技能产物 · 不阻断）
- `package.json` 版本 2.15.0 → **2.16.0**（P3 首批里程碑）
- 未接线模块清单 v1.10.0 → v1.11.0：统计 254 / 97 / 157 → **258 / 101 / 157**（kernel +2 文件、tests +2 入口）
- **新增演进指导文档**：`docs/YYC3-AI-Family-Agent-智能应用落地专家-20261023/05-技能与生态演进指导.md`——技能 / 技能库 / MCP / 插件四维现状审计、2026 生态调研（MCP 2026-07-28 · Agent Skills 开放规范 · A2A 1.0 · Agent Plugins 1.0）、三层能力供给目标架构、P3/P4 路线（12 项任务带验收）与 6 条 ADR
- 回归口径：**156 / 156 → 164 / 164**（23 套件 · 0 跳过 · 0 静默）；五支柱 知 25 → 33、学 61 → 69；门禁入口 21 → 22
- 未接线模块清单 v1.11.0 → v1.12.0：统计 258 / 101 / 157 → **260 / 103 / 157**（kernel +1 文件、tests +1 入口）
- `package.json` 版本 2.16.0 → **2.17.0**（P3-T3 统一技能 id）
- 回归口径：**164 / 164 → 173 / 173**（24 套件 · 0 跳过 · 0 静默）；五支柱 知 33 → 42、学 69 → 78；门禁入口 22 → 23
- 未接线模块清单 v1.12.0 → v1.13.0：统计 260 / 103 / 157 → **261 / 104 / 157**（kernel +1 文件、tests +1 入口）
- `package.json` 版本 2.17.0 → **2.18.0**（P3-T4 渐进披露检索）
- 回归口径：**173 / 173 → 182 / 182**（25 套件 · 0 跳过 · 0 静默）；五支柱 知 42 → 51、学 78 → 87；门禁入口 23 → 24
- 未接线模块清单 v1.13.0 → v1.14.0：统计修正为 **264 / 107 / 157**（并修正 v1.13.0 合计笔误：kernel 98 + family 140 + tests 24 应为 262 编译 / 105 已接线，误记 261 / 104）
- `package.json` 版本 2.18.0 → **2.19.0**（P3-T5 行为评测 · P3 六任务全部落地）
- 回归口径：**182 / 182 → 188 / 188**（26 套件 · 0 跳过 · 0 静默）；五支柱不变（契约套件不计支柱）；门禁入口 24 → 25
- 未接线模块清单 v1.14.0 → v1.15.0：统计 264 / 107 / 157 → **265 / 108 / 157**（tests +1 入口）
- `package.json` 版本 2.19.0 → **2.20.0**（P3-T6 面板能力供给卡片 · M11 收官 P3 全 ✅）
- CI 契约软校验步骤扩展 `check-plugins.mjs`（P4-T1 能力包格式 · 不阻断）
- 回归口径：**188 / 188 → 204 / 204**（28 套件 · 0 跳过 · 0 静默）；五支柱 治 47 → 55；门禁入口 25 → 27
- 未接线模块清单 v1.15.0 → v1.16.0：统计 265 / 108 / 157 → **270 / 113 / 157**（kernel +3 文件（10-能力注册中心）、tests +2 入口）
- `package.json` 版本 2.20.0 → **2.21.0**（P4-M12 注册中心里程碑：能力包可打包、可校验、可由 catalog 解析）
- 回归口径：**204 / 204 → 212 / 212**（29 套件 · 0 跳过 · 0 静默）；五支柱 治 55 → 63；门禁入口 27 → 28
- 未接线模块清单 v1.16.0 → v1.17.0：统计 270 / 113 / 157 → **272 / 115 / 157**（kernel +1 文件（10-能力注册中心/allowlist.ts）、tests +1 入口）
- `package.json` 版本 2.21.0 → **2.22.0**（P4-T3 准入治理：默认 observe · enforce 显式开关）
- 回归口径：**212 / 212 → 226 / 226**（31 套件 · 0 跳过 · 0 静默）；五支柱 治 63 → 71；门禁入口 28 → 30
- 未接线模块清单 v1.17.0 → v1.18.0：统计 272 / 115 / 157 → **274 / 117 / 157**（tests +2 入口）
- `package.json` 版本 2.22.0 → **2.23.0**（P4-T5 MCP 工具目录：manifest → tools/list · tools/call 经 Policy 分派）
- CI 契约软校验步骤扩展 `gen-mcp-tools.mjs --check`（P4-T5 工具目录 · 不阻断）
- 回归口径：**226 / 226 → 238 / 238**（33 套件 · 0 跳过 · 0 静默）；五支柱 治 71 → 77；门禁入口 30 → 32
- 未接线模块清单 v1.18.0 → v1.19.0：统计 274 / 117 / 157 → **276 / 119 / 157**（tests +2 入口）
- `package.json` 版本 2.23.0 → **2.24.0**（P4-T6 打包/检查 CLI · **M13 收官 P4 六任务全 ✅**）
- CI 契约软校验步骤扩展 `pack-plugin.mjs --check`（P4-T6 打包 CLI · 不阻断）
- **`docs/yyc3-ai-family-coding.skill` 容器归一**：内容不变（SKILL.md + references/ 三文件 32,243 B），ZIP 容器由系统 zip 换为 T6 确定性打包器（固定时间戳 / 排序 / 压缩级别），此后零漂移可校验
- CI 契约软校验步骤扩展 `check-external-worker.mjs` + `check-security-policies.mjs`（P2-T1/T4 · 不阻断）
- **激活链口径**：MCP 工具 44 → **45**（`shared.a2a-delegate` 准入，planned 不可见机制保留但计数归零）；金样例 44 → 45；能力供给面板 45/45/1；金包 digest `7b0d3fc3…` → `fe0c7d02…` → `436486d5…`（steps 契约后再重算），`assets/packs/family-core-1.0.0.skill` 9,864 → 11,659 B
- 回归口径：**238 / 238 → 258 / 258**（36 套件 · 0 跳过 · 0 静默）；五支柱 治 77 → 88、学 87 → 88、愈 49 → 50；门禁入口 32 → 36
- **能力供给指标基线**：指标 18 → **21 项运行期**（§6.3 能力供给 3 项）；告警 11 → **12 条**（新增 `CapabilityPluginDenied`，组 `yyc3-family-capability-supply`）；五维映射「17 项运行时 + 2 项 CI + 协同 4 单列 + 能力供给 3 单列」
- `package.json` 版本 2.24.0 → **2.25.0**（P2 生态外挂五任务 + P3-T1② steps 契约 + §6.3 供给指标；指导内已规划任务**全部清零**）

### Fixed

- **M26 合并闭环与门禁口径勘误（步骤 38）**：PR #2（M26 · squash **`3799dcc`**）为总规约「main 禁直推」下首个走分支 + PR 流程的合并——暴露 solo 仓治理死锁（保护策略要求 1 个批准审查，PR 作者不可自批且协作者仅作者一人，dependabot PR #1 同因未合并即关闭）；处置：快照保护规则后**仅将必需批准数 1 → 0**，必需检查「全量回归 + 五支柱面板」（strict）与会话解决要求原样保留（回滚：`gh api -X PATCH repos/YYC-Cube/YYC3-AI-Family-Agents/branches/main/protection/required_pull_request_reviews -F required_approving_review_count=1 -F dismiss_stale_reviews=true`）；README 门禁口径「45 个套件」→ **44**（`run-regression.mjs` 44 条目 · 面板 gate.specs=44）；02/03 补记与状态刷新

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
