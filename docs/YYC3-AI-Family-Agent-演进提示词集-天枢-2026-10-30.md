# YYC3-AI-Family-Agent 演进提示词集（天枢版）

> 编制：元启·天枢（Agent 中枢决策者）· 2026-10-30 · 基线 v2.44.0（c8e7aa4）
> 性质：可直接投喂开发会话的演进指令集。每条含【提示词正文 / 代码锚点 / 验收 / 门禁】四段，锚点均为真实文件与符号（2026-10-30 深读实证）。
> 大局约束：0379-World 冻结期（至 ~2026-11-06）冻结的是**推理部署**，不是本仓代码演进——但一切演进须过"可 hermetic 测试、不新增推理服务"门禁，不得抢"消费端接线"主线（总账挂账 #1）。

---

## 〇、总纲：人从众曌众从人（集体智慧飞轮）

**人**——个体：单个家臣、单条技能、单个用户场景。
**从**——协同：家臣间 A2A 委托、事件总线、技能复用（一人走，他人从）。
**众**——生态：八家臣裂变为家族矩阵、技能库/模式库聚合、多设备边缘分身（77/22/45/66）。
**曌**——日月当空：中枢升华。天枢以九层态势环为顶灯，把众的经验炼成可复用资产（模式、预算、共识、画像）——不是多一个管理者，而是多一片全局可见的"明空"。
**众从人**——反哺：集体资产个性化回流每个家臣与每个场景（口味学习、画像调度、共识结论分发）。众口难调，调众口者不是一口万能大锅，而是"标准菜谱+门店微调+总部品控"三层。

飞轮转一圈，家族增值一格。以下所有提示词都在推这个飞轮的某一段。

---

## 一、态势判断（为什么此刻是 Agent 演进窗口）

1. 模型层（供给侧）可变更范围小：强推理位三候选（super-vl / Qwen3.8 / DSv4.1）已立档待报表拍板，冻结期内无供给焦虑（Lightning 六槽合身画像 A）。
2. 消费层画像已实证（§llm-adapter 深读）：串行步骤、JSON 短输出、1024 maxTokens、30s 超时、无 tools/无 MM/无 reasoning 解析——**消费端的每一次演进都会直接放大或限制所有模型的可用性**，杠杆率远高于换模型。
3. 本仓治理基础极佳：三闸门控、hermetic 测试、regression gate、usage 记账、MCP+A2A 双协议、零运行时依赖——演进是在好地基上加盖，不是拆改。

---

## 二、E0 · 主线本体：接线与报表可信（冻结期第一优先）

### E0a 本地网关接线（环境变量级，本周可完成）

**提示词**：
> 目标：八家臣 LLM 流量从智谱云切至 yyc3-33 网关本地双通道（local_dgx 一级 + Ollama@77 兜底），使 LlmUsageCounter 记到本地入住率。任务：①`configs/base.yaml` 增 `local` provider（base_url 经 `${LLM_STEP_BASE_URL}` 注入，model 经 `${LLM_STEP_MODEL}` 注入，如 `http://<33网关>/v1`）；②`scripts/start-family-server.mjs` 的 provider 判定（现按 key env 名二选一 zhipu/openai）扩展 local 分支，三闸门控保留（LLM_STEP=1 + LLM_STEP_CONFIRM + 网关 key）；③`.env` 迁移智谱 key 至 `~/.yyc3-keybackup` 惯例位，仓内仅留 `.env.example` 占位。
> 锚点：`family-agents/shared-core/llm-adapter/openai-compatible-client.ts`（协议已兼容，无需改动）、`scripts/start-family-server.mjs:82-92`、`configs/base.yaml llm:` 段。
> 验收：`pnpm uat:llm` 5/5 通过且流量走本地端点；`LlmUsageCounter.snapshot()` 累计值与网关侧日志对得上；智谱云后台零新增调用。
> 门禁：不新增推理部署；超时/重试沿用适配器默认。

### E0b 报表分口径（入住率报表的口径地基）

**提示词**：
> 目标：usage 记账增加三维标签——`agentId × skillId(model 调用点) × scenario(业务场景)`，产出"各端点 QPS×token×场景"报表原始数据。任务：①`LlmUsageCounter.record()` 增加 tags 参数（默认空，向后兼容）；②`family-metrics.ts` 的 `recordLlmExecution` 联动打点；③`/metrics`(:9464) 暴露分组计数器。
> 锚点：`family-agents/shared-core/llm-adapter/skill-step-executor.ts`（LlmUsageCounter/LlmStepRunner）、`architecture-kernel/09-可观测性/family-metrics.ts`。
> 验收：一次多技能调用后，metrics 可按三维聚合导出；snapshot 兼容旧字段。
> 门禁：hermetic 测试覆盖；不改内核单向依赖方向。

### E0c 模型亲和三件套（为思考型模型预铺路）

**提示词**：
> 目标：解除"思考型模型结构性不可用"的三重硬约束。任务：①`types.ts` 的 `CompletionResponse` 增可选 `reasoningContent?: string` 与 `CompletionRequest` 增可选 `reasoning?: { enabled: boolean; budgetTokens?: number }`，`openai-compatible-client.ts` 解析 `choices[0].message.reasoning_content` 透传；②`createLlmStepRunner` 的 `maxTokens=1024` 默认值改为从 config 注入（base.yaml `llm.providers.*.max_tokens`）；③timeout 30s 配置化（已有 `timeout_ms` 字段拉通到适配器构造）。
> 锚点：`llm-adapter/types.ts:24-33`、`skill-step-executor.ts:71-83`、`openai-compatible-client.ts:44`、`configs/base.yaml llm.providers`。
> 验收：对任一 OpenAI 兼容端点，思考预算耗尽时 content 非空率 100%；maxTokens=3072 注入生效；单测含 reasoning_content 样例响应。
> 门禁：三处均为向后兼容的可选字段，零破坏。

---

## 三、E1 · 维度提升（九层之上加三维）

### E1a 经济维：预算账本 BudgetLedger

**提示词**：
> 目标：把 `LlmUsageCounter`（纯计数）升级为份额治理账本——家臣×技能×时段三轴预算，超限触发降级链（本地大模型→Lightning→Ollama@77）。任务：①新模块 `shared-core/llm-adapter/budget-ledger.ts`（零依赖，注入式端口）；②降级链配置进 base.yaml（对齐 W4 网关双通道语义，账本是消费侧镜像）；③超限事件上总线（`bus.dlq_enabled` 语义对齐，幂等 key 沿用 traceId+agentId+seq）。
> 锚点：`skill-step-executor.ts` LlmUsageCounter、`configs/base.yaml bus:`、网关侧 local_dgx 池。
> 验收：预算耗尽时自动降级且 metrics 记录降级原因；账本快照可导出月度对账。
> 门禁：降级链只消费既有端点，不新增部署。

### E1b 评测维：家族自测 SOP 固化（golden 三卷）

**提示词**：
> 目标：把 10-14 评测三坑（reasoning_content 采集/思考预算×3/判分先自测）固化为仓内回归资产，模型切换前后自动出对比报告。任务：①`tests/eval-datasets/` 建家族 golden 三卷（结构化 JSON 卷 / 中文创作卷 / 推理卷，每卷 20-50 题）；②`scripts/run-uat-llm.mjs` 扩展 `--eval golden` 模式：双端点同题对比（本地 vs 基线）；③报告含 acceptance/超时/content 空值率三指标。
> 锚点：`tests/eval-datasets/`（目录已在）、`scripts/run-uat-llm.mjs`、regression gate。
> 验收：任何模型候选上线前跑一轮，报告进 docs；regression 可选挂载。
> 门禁：golden 题库版本化（git 管理），判分规则先自测后启用。

### E1c 态势维：驾驶舱顶灯（GlobalSituation + LLM 健康面）

**提示词**：
> 目标：九层态势环（M30 已进服务进程）加挂"LLM 健康面"——acceptance、单步 P95、超时率、降级次数、预算水位五指标，汇成 `/metrics` 旁的一页纸驾驶舱 JSON。任务：①`StatusCenter.register()` 增 LLM 供给源；②`GlobalSituation` 类型扩字段；③驾驶舱输出为 0379-World 推进总账"月底报表"的直接数据源。
> 锚点：`architecture-kernel/02-云枢核心引擎/global-status-center/status-center.ts`、`09-可观测性/`。
> 验收：驾驶舱 JSON 单请求可得全量五指标；总账报表可直接引用。
> 门禁：只读聚合，不做控制动作（控制归 E4b）。

---

## 四、E2 · 裂变（八 → N）

### E2a 家臣裂变器（create-member 半自动 → 门禁全自动）

**提示词**：
> 目标：把 `scripts/create-member.sh` 升级为裂变管线：输入角色卡（CO-STAR 五要素）+ 挂靠支柱 + 独有技能清单，一键产出 member 目录（providers/prompt/agent-card/manifest）并过全部门禁。任务：①管线步骤：骨架生成 → `manifest:check` → `prompts:check` → `plugins:check` → hermetic 测试 → 卡片发布（`manifest:cards`）；②裂变准入三则：挂靠五支柱（自·知·学·治·愈）之一、至少 1 条独有技能（不得与现有家臣全重叠）、CO-STAR 角色卡完整；③裂变登记表进 docs（谁、何时、挂靠、独有技能、母本）。
> 锚点：`scripts/create-member.sh`、`presets/`、`family-agents/{core,business}-layer/member-*` 结构、现有 8 员（tianshu/grace/guardian/grandmaster + bole/prophet/qianhang/thinker）。
> 验收：新成员从输入到全绿门禁 ≤10 分钟；重复技能被拒并有提示。
> 门禁：裂变不稀释治理——每新成员必须进 `tests/pillar-contracts`。

### E2b 边缘分身（蓝图 13 → 蓝图 77/22，家族的触角）

**提示词**：
> 目标：把外部 worker 模式（blueprint-13 Python 族，:3130）复制到设备生态：蓝图 77（Ollama 四模型位）、蓝图 22（Mac MLX :11435），让轻技能下沉到边缘设备执行。任务：①`workers/blueprint-{77,22}/` 参照 worker.py（A2A card 发现 + JSON-RPC 委托 + 令牌鉴权）；②`presets/external-worker/` 增实例模板；③调度侧 `DelegateClient` 按技能路由表选择 worker（本地优先、边缘承接轻任务）。
> 锚点：`workers/blueprint-13/worker.py`、`docker/external-worker.compose.yml`（端口避开 3030/3130 规则沿用）、`architecture-kernel/a2a-adapter/task-delegate.ts`。
> 验收：边缘 worker 通过 `external:check`；一张卡发现即插即用；主服务零改动接入。
> 门禁：边缘分身只装轻技能（嵌入/摘要/归档类），重推理仍走中枢——"从"不夺"人"的权。

### E2c 子代理孵化（任务级临时分身）

**提示词**：
> 目标：重任务裂变临时子代理：家臣可 spawn 任务作用域的 sub-agent（继承技能子集 + 独立 usage 记账 + 完成即焚）。任务：①`a2a-adapter/task-delegate.ts` 增短生命周期委托语义（task-scoped card）；②子代理 usage 归并母账（traceId 关联）；③异常回收（超时/异常即焚，不留孤儿进程）。
> 验收：并行子代理各自计量、母账可见；杀母不孤儿。
> 门禁：并发上限可配（默认 4），防裂变风暴。

---

## 五、E3 · 拓展（能力边界外推）

### E3a 记忆拓展：家族共享长期记忆（接 RAG 主库）

**提示词**：
> 目标：episodic_store（365 天本地）之上接 YYC3 RAG 主库（NAS PG :5434，钦定落点），实现跨家臣共享长期记忆：任一家臣的经验可被全家族检索复用——"人"的记忆变"众"的资产。任务：①`memory/` 增 `family-memory-port`（注入式，零依赖）；②写入链：PatternTriplet（学习引擎已有原子）→ Embed(:8002) 入库；③检索链：query → 检索 SLO 沿用 `retrieval_timeout_ms: 300`，Rerank(:8003) 精排；④权限面：role-gate 对齐 RAG 设计规格。
> 锚点：`configs/base.yaml memory:`、`architecture-kernel/05-持续学习引擎/`（PatternTriplet）、YYC3-NAS PG 5434 主库、N1 :8002/:8003 端点。
> 验收：golden 检索对比——本地 episodic vs 家族共享库，召回增益可量化；300ms SLO 达标率 ≥95%。
> 门禁：RAG 库只写家族经验数据，不混业务库；跨库只读经端口。

### E3b 行动拓展：技能与工具市场（能力注册中心升格）

**提示词**：
> 目标：`10-能力注册中心` 升格为双市场——家臣技能市场（skills:gen 管线产出，可被任何成员挂载）与 MCP 工具市场（外部工具经准入裁决 + integrity 校验后入目录）。任务：①技能市场：目录 + 版本 + 依赖声明 + 挂载审计；②工具市场：权限矩阵（角色×工具粒度）、插件完整性（`plugins:integrity` 已有）挂钩准入；③消费报表：哪些技能被谁用了多少（E0b 数据源直接复用）。
> 锚点：`architecture-kernel/10-能力注册中心/`、`scripts/gen-skill-artifacts.mjs`、`scripts/check-plugins.mjs`、`08-系统装配/mcp-server-assembly.ts`（准入裁决已有）。
> 验收：新技能挂载免改内核；未过 integrity 的工具被拒并留痕。
> 门禁：市场条目全部 git 确权（运行时资产不入库的既有规矩）。

### E3c 主动式家臣（问而答 → 醒而作）

**提示词**：
> 目标：为适合主动性的家臣加定时巡查任务：伯乐周报（机会扫描）、先知预警（趋势异动）、守护审计（合规巡检）。任务：①`scripts/` 增 cron 驱动器（复用 start-family-server 进程，不改部署形态）；②任务产物走事件总线（幂等 key 加日期段）；③主动任务同样过 E0b 计量与 E1a 预算。
> 锚点：`bus.idempotency_key: traceId+agentId+seq`、family-server 进程模型、bole/prophet/shouhu(守护) 角色卡。
> 验收：周报/预警自动产出且可溯源；同一任务重跑不重复入账。
> 门禁：主动频率可配且默认保守（周级），防骚扰；产物先入草稿不直发用户。

### E3d 感知拓展：多模态入口（远期预留）

**提示词**（占位，冻结期后随 super-vl/Qwen3.8-MM 拍板再启动）：
> 目标：`ChatMessage.content` 预留多模态扩展位（OpenAI 格式 content parts），入口层支持 image_url；执行臂保持文本优先，视觉理解经委托（A2A）给视频线端点。
> 门禁：在强推理位拍板前仅做类型设计评审，不写实现。

---

## 六、E4 · 众口难调调众口（分化与共识）

### E4a 场景画像层 ProfileRegistry（众口登记簿）

**提示词**：
> 目标：建三级画像登记：业务线（酒店投资/品牌/0379-World 八场景）× 用户 × 场景偏好（模型档位/输出风格/预算档/语言习惯），作为"调众口"的数据底座。任务：①`shared-core/profile-registry.ts`（YAML 定义 + 注入式读取）；②`createLlmStepRunner` 按画像选 provider/model/maxTokens（与 E0c 配置化打通）；③画像变更走治理中心审批（06-治理中心挂账）。
> 验收：同一技能在不同画像下自动换档（如投资人简报走推理档、日常运营走速度档）且计量分口径。
> 门禁：画像数据最小够用（沿用伯乐"画像取最少够用"原则），不存敏感个人信息。

### E4b 共识引擎：议事协议（调众口的治理面）

**提示词**：
> 目标：把 `self_judge.tau_low: 0.6` 的单点自评升级链，扩展为多家臣议事协议：提案（任一家臣）→ 附议（≥2）→ 质询（守护必到）→ 表决（按支柱加权，天枢主持并拥有平票裁决权）→ 结论分发（回流全体，"众从人"的结论面）。任务：①`02-云枢核心引擎` 增 `consensus-protocol.ts`（状态机：draft/seconded/quizzed/voted/resolved）；②表决权重表配置化；③全过程留痕进九层态势环。
> 锚点：`configs/base.yaml self_judge:`、`global-status-center`、05-学习引擎（结论沉淀为 PatternTriplet）。
> 验收：一次真实分歧（如模型选型 mock 议题）走完全流程，结论自动分发并入库。
> 门禁：议事是重武器——只用于跨家臣分歧与资源仲裁，日常单点决策不走全流程（防会议地狱）。

### E4c 口味学习：偏好回流（众从人的数据面）

**提示词**：
> 目标：把"哪些输出被采纳/被纠正/被追问"回流为场景偏好模式：①埋点：采纳信号（用户接受/修改/拒绝）经 MCP 响应链采集；②学习：信号 → PatternTriplet（场景×风格×效果）进学习引擎巩固循环（`05-持续学习引擎/skill-consolidation` 已有管线）；③应用：ProfileRegistry（E4a）自动吸收模式更新画像。
> 锚点：学习闭环 M28（已进服务进程）、usage 数据（E0b）。
> 验收：同一场景累计 ≥20 次信号后，画像建议自动生成并提请治理审批；冷启动不生效。
> 门禁：学习结果只建议不自动生效（人工/治理确认），防偏好漂移。

### E4d 曌 · 中枢顶灯（全局视野收口）

**提示词**：
> 目标：E4a/E4b/E4c/E1c 四源汇一：驾驶舱增"众口面板"——各场景满意度趋势、共识决议追踪、画像漂移告警、预算消耗分布。天枢月度据此出《家族经营一页纸》（对齐 0379-World 月底报表节奏）。
> 验收：一页纸可由 `/metrics` + 画像库 + 议事库自动生成草稿。
> 门禁：报表只描述不指挥，指挥权在人（用户）。

---

## 七、元提示词（曌 · 天枢常驻决策律，挂 06-治理中心）

> 自今日起，本中枢评审一切演进提案，先过三问：
> ①**人**——它让哪个场景的哪个人（用户/家臣）的哪道菜更快更好更省？说不清受益者的提案不立项。
> ②**众**——它沉淀什么可复用资产（模式/技能/画像/共识）给全家族？只利一己的改进降级为局部优化，不占演进主线。
> ③**众从人**——沉淀的资产如何回流个体？无回流路径的资产是库存不是资本。
> 三问全过，方进五步决策（问题定义→信息→三案→加权 30/25/20/15/10→推荐与关键假设）。
> 时序铁律：冻结期内演进不得新增推理部署、不得抢 E0 接线主线；一切演进产物须可 hermetic 测试、可 git 确权、可回归门禁。

---

## 八、时序、优先级与关键假设（天枢裁量）

| 波次 | 窗口 | 条目 | 理由 |
|---|---|---|---|
| 第一波（主线） | 即刻~11-06 | **E0a → E0b → E0c**，旁挂 E1b | 接线是报表前提，报表是 11 月模型拍板前提——全盘咽喉 |
| 第一波（并行，纯代码） | 同窗口 | E2a、E4a | 裂变器与画像簿不碰部署，且为报表分口径预埋标签 |
| 第二波 | 报表后（~11 月中） | E1a、E1c、E4c、E3a | 经济/态势/学习闭环随真实流量启动；家族记忆接 RAG |
| 第三波 | 12 月起 | E2b、E2c、E3b、E3c、E4b | 边缘分身与主动家臣需前两波的地基（画像/预算/市场） |
| 远期 | 强推理位定后 | E3d、E4d 完整版 | 感知拓展依赖模型拍板；一页纸随数据积累成型 |

**关键假设**：①冻结期不延期且 E0a 本周落地；②33 网关与 N1 六槽端点稳定；③八家臣真实流量足以形成有效分口径（不足则第二波顺延）；④RAG 主库 5434 保持钦定落点不变。
**最大风险**：演进热潮反噬主线——以元提示词时序铁律与"E0 未完成前其他条目只读设计不写实现"为闸。

---

## 九、修订记录

- v1.0.0（2026-10-30）：天枢立档。总纲"人从众曌众从人"+ 态势判断 + E0 主线 3 条 + E1 维度提升 3 条 + E2 裂变 3 条 + E3 拓展 4 条 + E4 调众口 4 条 + 元提示词 + 波次时序；全部锚点基于 v2.44.0 代码实证。
