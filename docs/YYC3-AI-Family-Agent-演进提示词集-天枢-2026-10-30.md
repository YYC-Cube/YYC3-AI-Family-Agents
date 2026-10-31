# YYC3-AI-Family-Agent 演进提示词集（天枢版）

> 编制：元启·天枢（Agent 中枢决策者）· 2026-10-30 · 基线 v2.44.0（c8e7aa4）
> 性质：可直接投喂开发会话的演进指令集。每条含【提示词正文 / 代码锚点 / 验收 / 门禁】四段，锚点均为真实文件与符号（2026-10-30 深读实证）。
> 大局约束：0379-World 冻结期（至 ~2026-11-06）冻结的是**推理部署**，不是本仓代码演进——但一切演进须过"可 hermetic 测试、不新增推理服务"门禁，不得抢"消费端接线"主线（总账挂账 #1）。
> **v1.1.1 暂缓令（2026-10-30 用户指令）**：编程体系（本仓）与企业蓝图两块已完成资产**演进整体挂起**——本集 E1-E5 除 E0（接线主线仍有效）外全部冻结至另行解冻；多领域同框对齐工作已移交独立会话执行，入口提示词：`/Users/yanyu/YANYUCLOUDCUBE/YYC3-AI-Family-Agent/YYC3-AI-Family-Agent-多领域同框对齐-执行提示词-20261030.md`；主战场回归模型部署（强推理位三候选待报表拍板）。
> **v1.2.0 解冻令（2026-10-31 天枢签发，限第一波）**：E0 已闭环（TS v2.48.0 · PR #14 · uat:llm 5/5 走 :10086 · 3290 tokens · 三维计数器真值 · 智谱云零新增），暂缓令对下述范围解除——**第一波 E1b / E2a / E4a 即刻解冻**（执行卡三件同日签发于 docs/，均满足"可 hermetic 测试、不新增推理服务"门禁，端点/模型名一律 env 引用）；**第二波维持 11 月中入住率报表 + 强推理位拍板后启动**。**豁免项**：npm publish（过 M32 发布预检 + W0 公开仓安审门后可发）/ 仓内维护；**八家人内容工程不豁免、并入第一波 E4a 任务③**（千行基准 · 喂 E1b golden 题源）。**顺延判据**：至 2026-11-07 24:00 三维计数器累计 `calls_total ≥ 300 且 tokens ≥ 60K 且覆盖 ≥6 员（单员 ≥30 调用）且 ≥2 业务场景（各 ≥60 调用）`；未达则第二波顺延一周（累计 ≤2 轮）并于总账归因（智谱零增量前提下 calls 停滞=真无流量）。**波次表勘误（随签发）**：10.3 第一波"Flask .env token 外置"**作废**（八家臣栈 10-31 已退役归档 OPS/定义/）；E5b 吸收对象由"Flask 族四资产"改为 **OPS/定义/yyc3-family-ai-agents-runtime/ 归档件**。**model.tier 占位**：`tier: ${LLM_STEP_TIER:-flagship}`，强推理位正式拍板后回填。

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
> **【v1.1.0 修正注】人格红线**：多行业场景库（电商/营销/知识中枢/短剧）已立"命名红线"——8 位家族角色是定数，域内职能经映射表重绑，**不新建角色体系**。故本条的裂变对象收窄为"非家族核心的边缘执行成员/子代理"；面向行业扩张的正确裂变单位是**域包 DomainPack**（见 §十 E5a），新家臣裂变仅限运行时确需的专职位（如未来"技能市场管理员"），且须过本门禁。

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
> **【v1.1.0 实体化注】**画像层的首批实体已存在：多行业场景四库（电商协同/内容营销/知识中枢/视频短剧）即四个预置**域包**——域 Prompt（8 角色换域映射表）× 技能子集 × 模型档位 × 权限矩阵。ProfileRegistry 的第一版应直接以 DomainPack 注册表形态落地（见 §十 E5a），不再从零造画像。

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

## 十、多行业场景与知识底座衔接（v1.1.0 增补，2026-10-30）

> 依据：《YYC3-AI-Family-Agent-多行业场景Agent分析-20261030》（YANYUCLOUDCUBE 侧全量盘点）＋ 提示词工程 11/12/13 三卷实地核读。

### 10.0 全域三层地图（认知升级）

- **知识层**（`YYC3-生成式人工智能提示词工程/`）：**11 卷=商学院教材**（模型架构九子域，五维五高五标五化理念贯穿）、**12 卷=运营法典**（拟人化协同架构/四大智能化实战/协议栈/可观测/安全伦理/总纲 1213）、**13 卷=样板间**（代码示例九域 + API V3 十场景 100% ready + 全栈 compose）。演进产物应向法典与样板对齐，而非自创规范。
- **实现层**（两大代码族＋场景组件族）：①**TS 内核族**＝本仓（v2.44.0，MCP/A2A、九层、npm 双包、治理门禁成熟）＝"编程体系已实现"的正身；②**Python Flask 族**＝`YANYUCLOUDCUBE/YYC3-AI-Family-Agent/yyc3-family-ai-agents/`（8 成员 IDENTITY/SYSTEM/SOUL 三件套 + agent_server.py v3.2 + governance-hub:25700 + 8 服务 :25600-25607 + Chroma 记忆 + X-YYC3-Token）＝当前唯一在跑的人格化运行时；③**场景组件族**＝视频短剧 BaseAgent（生产真源 `yyc3-0379-world/core/agents/`）＋13 卷示例。**四套 Agent 定义载体互不引用是当前最大结构性债。**
- **场景层**：域 Prompt 四库（电商/营销/知识中枢/短剧，同 8 角色换域重映射）＋技能登记层（skills-library 126 条，回源外部托管池）＋企业蓝图（五维驱动，12/13 卷承载）。

### E5a 域包 DomainPack（裂变的正确单位，"众口"的实体）

**提示词**：
> 目标：把四个场景库收敛为标准**域包**格式并在本仓注册：`DomainPack = manifest（域标识+8 角色域内职能映射表，沿用命名红线）+ prompts/（域 Prompt 即接口）+ skills.subset（按 skill.id 声明，对账 skills-library source）+ model.tier（档位与预算）+ permission（对齐权限矩阵 L0-L3）`。任务：①定义 `presets/domain-packs/*.yaml` 规范；②首批四包：电商协同/内容营销/知识中枢/视频短剧（从各库 Prompt.md 平移，不重写）；③`runtime-assembly` 增按域加载钩子；④企业蓝图作为"底座包"（不换域只加权）随四包常驻。
> 锚点：`architecture-kernel/08-系统装配/runtime-assembly.ts`、`presets/`、四库 Prompt.md、`yyc3-skills-library/`（`yyc3-skill/v1` frontmatter 直接兼容）。
> 验收：同一技能调用在四包下呈现四域人格与职能；域切换零代码改动（换包即换域）。
> 门禁：域包内容 git 确权；人格/权限/审计不随域放松。

### E5b 运行时统一（TS 骨 + Flask 魂，两步走）

**提示词**：
> 目标：终结两套运行时并行——**本仓 TS 内核为唯一正源**，Flask 族的四项资产吸收进来：①IDENTITY/SYSTEM/SOUL 人格三件套→`08-系统装配` 人格装载位（资源包形态）；②governance-hub 审计/预算/冻结概念→对齐三闸门控与 E1a 账本（已有等价物，做语义映射表即可）；③X-YYC3-Token→三闸 + 网关 key 体系；④Chroma 记忆→E3a 家族记忆（RAG 5434）。过渡三步：先域包互通（两运行时都能加载 E5a 域包）→ Flask 服务逐域下线 → TS 单运行时收口。Flask 侧 P0（`.env` 明文 `FAMILY_AUTH_TOKEN` 在同步树内）**立即外置真值**，不等迁移。
> 锚点：本仓 `family-server.entry.ts`（MCP :3030）、Flask `agent_server.py v3.2`（:25600-25607）、总账挂账 #1。
> 验收：语义映射表评审通过；每下线一个 Flask 服务，对应域在 TS 侧全绿门禁。
> 门禁：迁移期两运行时**双跑但单账**（usage 只记 TS 侧统一账本，防双计）；不改 8 服务对外端口契约直到消费端全部切换。

### E5c 知识底座挂钩（教材→法典→样板→实现的引用链）

**提示词**：
> 目标：建立"11/12/13 → 本仓"的单向引用链：①E1b golden 三卷出题域对齐 11 卷知识体系与 API V3 十场景（Q3 能力建设×5 + Q4 价值创造×5 作集成测试场景源）；②本仓一切规范类产物的编写规范对齐 1206（蓝图编写规范）与 1306（协议栈）；③元提示词增补条款：**演进提案须声明"对齐 1213 总纲五维驱动模型的哪一维"**，说不清维度归属的提案退回。
> 验收：golden 卷 ≥60% 题目可溯源到 11/13 卷条目；新规范文档头部带法典引用栏。
> 门禁：引用是单向的（实现引法典，法典不迁就实现），防止规范漂移。

### 10.3 波次增补（对 §八 的增量修订）

- 第一波追加：**Flask .env token 外置（P0，即刻）**、E5a 域包规范+四包平移（纯文档/配置，不碰部署）。
- 第二波追加：E5b 运行时统一启动（域包互通先行）；skills-library 三薄域补齐（S-01 天枢决策工具/S-02 千行意图路由/S-05 伯乐画像匹配——"发号施令者也要有几件称手工具"）。
- 名不符实目录处置（编程体系正名/网关部署归档）随第一波文档整理顺手完成，遵循分析报告 §六 建议。

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

- v1.2.1（2026-10-31）：**E4a 已执行（TS 仓 v2.49.0）**——ProfileRegistry（三级画像 + 换档 tier/style + `llm-assisted@<profileId>` 分口径计量标签）落地；八家人业务域卡入册（presets/profiles/domains/ ×8 · prompt_anchors 即千行基准转译要点 · E1b 业务卷题源就绪）；域包映射表入 docs（四库 DomainPack ↔ 预置画像）；换档演示双例过门禁（investor-briefing→reasoning / intent-routing→speed · 计量分口径可见）；tier 占位 `${LLM_STEP_TIER:-flagship}` 待强推理位拍板回填。回链：docs/YYC3-AI-Family-Agent-场景画像层使用说明-E4a.md。
- v1.1.4（2026-10-31）：**E0 live 验收收口（TS 仓 v2.48.0）**——网关三值由用户投喂（Tailscale :10086 / nemotron-3.5-super-vl / 无 key 的 /v1 即用）：uat:llm **5/5 走本地网关**（http 豁免开关 UAT_LLM_ALLOW_HTTP=1——缺省仍 https-only）；selftest:llm local 档全链（3 技能 5/5 填充 · 累计 3290 tokens · family_llm_usage_* 三维计数器真值）；智谱云零新增。**E0 卡 DoD 全项达成**。回链：docs/YYC3-AI-Family-Agent-usage首日报-E0b基线-2026-10-30.md（live 版）。
- v1.1.3（2026-10-30）：**E0 消费端接线已执行（TS 仓 v2.47.0 · PR 待合并）**——E0a 代码/配置/密钥迁移全部就绪（base.yaml local 档 + start-family-server local 分支三闸 + 智谱 key 迁 keybackup(600) + keybackup 兜底读取链）；E0b 计量分口径落地（LlmUsageCounter 三维 tags 分桶 + family_llm_usage_{tokens,calls}_total 双计数器 + baseDispatch 增量联动，343 例门禁含 E0c-3/M11 断言）；E0c 模型亲和三件套落地（reasoning 请求/响应透传 content 空不崩可计量 + maxTokens/timeout_ms base.yaml 档位注入）；usage 首日报（E0b 基线）落 docs/。**卡点（红线5 如实）**：网关 live 验收挂起——LAN :8000 存活但候选 key 均 403、旗舰直连 Tailscale 000、兜底77 无 qwen3-coder-30b；智谱侧新 key 429 余额不足（云通道实际已断，切换动机成立）。**待网关侧签发有效 key 后一条命令完成 live 验收**。回链：docs/YYC3-AI-Family-Agent-usage首日报-E0b基线-2026-10-30.md。
- v1.0.0（2026-10-30）：天枢立档。总纲"人从众曌众从人"+ 态势判断 + E0 主线 3 条 + E1 维度提升 3 条 + E2 裂变 3 条 + E3 拓展 4 条 + E4 调众口 4 条 + 元提示词 + 波次时序；全部锚点基于 v2.44.0 代码实证。
- v1.1.0（2026-10-30）：多行业场景与知识底座衔接增补——依据 YANYUCLOUDCUBE 侧《多行业场景Agent分析-20261030》与提示词工程 11/12/13 三卷核读：①全域三层地图（知识层/实现层两大代码族/场景层）；②E2a 加人格红线修正注（8 角色定数，行业裂变单位改为域包）；③E4a 实体化注（四场景库即首批域包）；④新增 §十：E5a 域包 DomainPack、E5b 运行时统一（TS 骨+Flask 魂两步走+P0 token 立即外置）、E5c 知识底座单向引用链、波次增补（P0 安全/域包先行/三薄域补齐/名不符实目录处置）。
- v1.1.1（2026-10-30）：暂缓令——编程与企业蓝图演进挂起（E0 接线主线除外）；多领域同框对齐移交独立会话（执行提示词已签发至 YANYUCLOUDCUBE/YYC3-AI-Family-Agent/ 路径）；主线回归模型部署。
- v1.1.2（2026-10-30）：同框对齐回执——YANYUCLOUDCUBE 侧 P0-P4 完成:令牌外置 keybackup(600)/伯乐统一知遇·伯乐/FAmily→Family/电商 DomainPack 样板(E5a 首件)/skills-library 129 条对账零失源+三薄域补登(S-01/S-02/S-05 各≥2)/模型映射表按附录 A 现役重排;git 六阶段提交在档,基线快照居首。**尾项:三库 PACK 复制待用户过目样板后执行,E5b 运行时统一仍待 TS 仓解冻。**回链:《YYC3-AI-Family-Agent-同框对齐完成报告-20261030.md》(YANYUCLOUDCUBE/YYC3-AI-Family-Agent/)。
- v1.1.4（2026-10-30）：返工批次回执——审核初审(✅15/⚠️3/❌3)后 R1-R5 消号闭环,**复核轮 ✅ 放行**:**四库 DomainPack 齐备**(营销/知识中枢/短剧 PACK 补产,知识中枢按九环链路补列 role_mapping);端点口径全量 N2:8100(N1:8000 让路);短剧 8 文件过时模型清理(.py 5 处冻结登记 E5b 待办);FAmily 非冻结区 38 文件收敛 + git 索引大小写修复 117 条(含冻结区 22 文件名,复核裁定 diff=0 不破铁律);对账表明细 129 行。复核随手修已随批:三库 PACK 计数改 20/19/17(unique,附计数命令)。E5b 待 TS 仓解冻;强推理位 11 月中旬拍板后回填 model.tier 占位。回链:同 v1.1.2(报告已升 v1.1.0,含审核差异处置节;审核报告 v1.1 含复核轮 §七)。(注:编号由 v1.1.3 顺延,E0 主线回执先行占用 v1.1.3。)
- v1.2.0（2026-10-31）：解冻令——E0 已闭环（TS v2.48.0 · PR #14 · uat:llm 5/5 · 3290 tokens · 智谱零增量，回链 TS 仓 CHANGELOG），第一波 E1b/E2a/E4a 即刻解冻（执行卡三件签发：docs/YYC3-AI-Family-Agent-{E1b,E2a,E4a}执行卡-2026-10-31.md），第二波维持报表后启动；豁免项：npm publish（M32 预检+W0 安审门）/仓内维护；八家人内容工程不豁免、并入 E4a 任务③；顺延判据：11-07 24:00 前 calls≥300·tokens≥60K·≥6 员单员≥30·≥2 场景各≥60，未达顺延一周（≤2 轮）并归因；波次表勘误：Flask token 外置作废（八家臣退役）、E5b 吸收对象改 OPS 归档；model.tier 占位待强推理位拍板回填。
