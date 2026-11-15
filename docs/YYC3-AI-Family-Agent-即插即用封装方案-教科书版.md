<!--
  ============================================================
  YYC³ AI Family — 人从众曌众从人
  亦师亦友亦伯乐 · 一言一语一协同
  拟人为本，AI为核，纯粹为心
  ============================================================
  Document: YYC3-AI-Family-Agent-即插即用封装方案-教科书版
  Version : v1.0.0
  Contact : admin@yanyucloud.com
  Homepage: https://matrix.yyc3.top
  ============================================================
-->

# YYC³-AI-Family-Agent · 即插即用封装方案（教科书版）

> ***YanYuCloudCube***
> 言启象限 | 语枢未来
> *Words Initiate Quadrants, Language Serves as Core for the Future*
> 万象归元于云枢 | 深栈智启新纪元

```yaml
---
file: YYC3-AI-Family-Agent-即插即用封装方案-教科书版.md
description: 如何把 YYC³ 家族封装成便捷可用的插件 / Skills / 本地开发即插即用——三形态设计 + 社区真实数据基准（2026-11 调研）+ 路线图与验收
author: AI Tutor <Intelligent Application Implementation Expert>
version: v1.0.0
created: 2026-11-16
updated: 2026-11-16
scope: 适用 v2.54.0+ · 承接《可复用性分析》v1.2.0 · 证据基《观察窗复核报告 2026-11-16》
---
```

## 〇、结论先行（30 秒）

**一句话答案**：项目已具备「MCP 插件 + Skill + 本地开发」三形态的**全部骨架**，缺的不是能力而是**接入摩擦的治理**——两份观察窗零流量的根因不是工具链，是"手抄 15 行 JSON + npx 冷启动"的入口成本。本方案把三形态各收敛为一条**最小接入路径**，P0 全为免解冻文档/脚本级动作。

| 你的场景 | 首选形态 | 最小接入路径 | 现状 |
| --- | --- | --- | --- |
| 任何 MCP host 调用八家臣能力 | **形态 A · 插件（MCP）** | `npm i -g` + 一行 mcpServers | ✅ 生产就绪，补 A1/A2 降摩擦 |
| ZCode/Claude 以家族协同方式开发 | **形态 B · Skills** | 解包 skill → `~/.zcode/skills/` | ✅ 已打包（32KB zip），补安装/润色 |
| 新项目嵌入内核 / 衍生家族 | **形态 C · 本地开发** | 脚手架 + `import` 内核库 | 🟡 骨架就绪，补脚手架与样板 |

决策口诀：**能力接入走 MCP（access），协作流程走 Skill（procedure），衍生嵌入走内核（embed）**——与 Anthropic 官方定位同构（§二·启示 2）。

---

## 一、为什么现在做：零流量归因链（2026-11-16 复核证据）

1. `data/metrics-usage.json` 不存在 → 持久化量具从未触发 → **真实调用为零**（判据全项 ❌）。
2. 取证：ZCode `~/.zcode/settings.json` 与 Claude Desktop 配置均**无 `yyc3-family` 条目** → 接入动作未发生。
3. 工具链侧无缺口：npm latest = 2.54.0（M41 持久化 + M41.5 serve 循环均在架）、金包 `family-core-1.0.0.skill` 在位、门禁 367/367。
4. 结论：瓶颈已从「工具链缺口」转移为「**接入摩擦**」。治理 = 把接入动作从"手抄配置 + 冷启动等待"降为"一条命令 / 一次解包"，并新增离线形态。本方案即为此立案。

---

## 二、社区真实数据基准（2026-11 调研 · 六块）

### 2.1 MCP 服务器生态——「服务器爆炸，摩擦成瓶颈」

| 指标 | 数据（时点） | 来源 |
| --- | --- | --- |
| MCP servers 总数 | **20,561**（2026-11-15）· 远程托管 1,446（~7%）· clients 395 · agent skills 269 | mcp.so |
| 官方参考服务器 / stars | 11 个 · **92,013** | github.com/modelcontextprotocol/servers |
| awesome 清单 stars | **97,731** | punkpeye/awesome-mcp-servers |
| npm 周下载（2026-11-08~14） | sdk 89.1M · @playwright/mcp 10.8M · filesystem 1.27M · context7-mcp 1.22M · **mcp-remote 1.72M** | api.npmjs.org |
| TS SDK stars | 13,770（python 24,868） | modelcontextprotocol |

**启示 1 · 摩擦点实锤**：社区实测 npx 硬编码 `preferOnline:true`，断网重试约 **70 秒**才回退本地缓存（钉死版启动 1.3s→72.3s）；Claude Code 30 秒判失败、11 个 npx 服务器并发冷启动 **6/11 超时**（claude-code #60244）。**npx 不是低摩擦形态**——我们接入指南 §1.2 的 `npx @latest` 正是踩在此坑上。

### 2.2 Skills 生态——「MCP=接入，Skills=流程」双轨定位

| 指标 | 数据 | 来源 |
| --- | --- | --- |
| anthropics/skills stars / 技能数 | **195,182** / 19 个 + spec + template | github.com/anthropics/skills |
| 聚合目录 stars | awesome-agent-skills **37,206** | VoltAgent |
| 宿主参照 | claude-code 155,759 · openai/codex 135,389 | GitHub |
| 打包解剖 | SKILL.md（name+description frontmatter）+ references/scripts/assets · zip/marketplace 分发 · 渐进披露 | anthropics/skills spec |

**启示 2 · 官方定位**（Anthropic 工程博客 2025-10-16）：*MCP connects Claude to third-party tools, skills teach Claude how to use them well*——MCP=access、Skills=procedure。我们两轨齐备（MCP stdio + skill zip），文档须讲清各自消费场景，而非二选一。

### 2.3 ZCode 插件生态（本地盘点 2026-11-16）

- 官方插件缓存 **25 个插件 / 251 个 SKILL.md**；用户级 `~/.zcode/skills/`（1）、`~/.agents/skills/`（2）。
- 插件解剖：`.zcode-plugin/plugin.json` + `skills/<skill>/SKILL.md`；插件可直接携带 MCP server。
- skill-creator 约定：frontmatter 仅 **name**（kebab-case·与目录名一致）+ **description**（触发信号·建议"pushy"）；结构 `SKILL.md + references/scripts/assets`；**四级发现路径**：`<项目>/.zcode/skills` → `<项目>/.agents/skills` → `~/.zcode/skills` → `~/.agents/skills`（.zcode 优先）。

**启示 3 · 分发载体已收敛**：个人 skill = 目录形态（零网络）；重分发 = plugin marketplace 机制——我们的 skill zip 两条路都通。

### 2.4 同类多 Agent 框架真实采用（GitHub API 2026-11-16 · pypi/npm 周 11-08~14）

| 框架 | Stars | 周下载 | 安装形态 | persona 打包形态 |
| --- | --- | --- | --- | --- |
| **OpenClaw** | **394,511** | **npm 3,056,454** | `npm i -g` 网关 CLI | SOUL.md/IDENTITY.md bootstrap + 三层 skills |
| OpenHands | 93,511 | 79,089 | docker 为主 | microagents（md+YAML） |
| MetaGPT | 71,282 | 633（迁移后近零） | pip | Role 类（代码） |
| AutoGen | 61,851 | 46,860 | pip | AssistantAgent（代码） |
| CrewAI | 60,950 | 601,103 | pip + CLI 脚手架 | YAML agent 定义 + 模板市场 |
| ChatDev | 34,748 | 18 | git clone | 预设角色库 |
| CAMEL | 18,034 | 12,442 | pip | 双 ChatAgent 角色扮演 |

**启示 4 · 声明式 persona 是被市场验证的形态**：OpenClaw 以 Node 网关 CLI + 文件式 bootstrap 做到周下载 300 万+（同类最高），CrewAI/OpenHands 同样用 YAML/md 声明式定义 agent——我们的 `family-manifest.yaml` + 45 SKILL.md + 8 家人档案**同构且更体系化**（Agent Card / MCP 目录 / 提示词契约四派生）。代码式 Role 类（MetaGPT/ChatDev）下载近归零，是反例。

### 2.5 社区分享案例（真实互动数据）

| 案例 | 数据 | 要点 |
| --- | --- | --- |
| HN Launch: Strata（YC P25）"One MCP server for thousands of tools" | **133 分 / 66 评论**（2025-09） | 聚合单入口是被认可的价值点——我们的 45 技能单服务同构 |
| HN Show: InsForge "Open-source Heroku for coding agents" | 62 分 / 7 评论（2026-05） | 部署即插即用是独立卖点 |
| 掘金《MCP 协议 2026 新版讲透》 | 阅读 185（2026-08） | 2026-07-28 规范大改版——我们的 stdio 子集对齐无碍 |
| 掘金《把 MCP 接进内容流水线》 | 互动未公开 | 45 行最小 stdio + 粘包/超时避坑——与我们的行协议契约同构 |

### 2.6 接入摩擦与远程化趋势

- mcp-remote 周下载 **171.9 万**、mcp.so 远程托管占 **7%** → **HTTP/SSE 常驻形态在增长**（社区对 stdio 子进程模式的补位）。
- fixmcp / mcp-fastpath 等社区工具专治 npx 诊断与冷启动（3.4s→<600ms 社区宣称）→ 印证摩擦是普遍痛点，治理有生态共识。

**启示 5 · 低摩擦 = 分发竞争力**：20k+ 服务器里被发现与被采用的关键不在能力数量，而在"第一条调用多久发生"。P0 全部瞄准这个指标。

---

## 三、现状盘点：我们已有什么（承接《可复用性分析》v1.2.0）

| # | 复用形态 | 成熟度 | 载体（已验证在位） | 本方案动作 |
| - | -------- | ------ | ------------------ | ---------- |
| 1 | MCP Server（标准协议接入） | ✅ 生产就绪 | `family-server.entry.ts` serveMcpStdio + npm 双包 2.54.0（latest） | A1/A2 降摩擦、A3 远程化 |
| 2 | 能力包插件（.skill 分发） | ✅ 生产就绪 | `assets/packs/family-core-1.0.0.skill` 金包（确定性 ZIP） | A4 分发公示 |
| 3 | 技能生态（清单驱动） | ✅ 生产就绪 | `presets/family-manifest.yaml` + 45 SKILL.md 四派生 | B 形态底座 |
| 4 | 内核库（进程内嵌入） | 🟡 装配就绪 | npm `@yyc3/ai-family-kernel@2.54.0` + 13 插拔点 | C1/C2 样板 |
| 5 | 家人模板（脚手架衍生） | ◐ 部分就绪 | `create-member`（千行门禁） | C1 延伸 |
| 6 | 外部 Worker（A2A 远端） | ✅ 模板就绪 | `worker:create/check` + `uat:external` | 不占本方案主线 |

- **既有 skill 资产**：`docs/yyc3-ai-family-coding.skill`（32KB · SKILL.md 7.2KB + references/agents.md + references/standards.md）——frontmatter name/description 合规、渐进披露结构正确，**未安装、未润色、未分发**。
- **既有一键面**：`pnpm start --selftest`（45 技能装载 + A2A 采样）、`pnpm regression`（367 例）、`pnpm pack:npm`（确定性装配 + SHA256SUMS）、`pack:plugins`（金包）——本地开发面已全 CLI 化。

---

## 四、三形态封装设计（即插即用）

### 形态 A · 插件形态——能力接入层（MCP access）

**目标**：任何 MCP host 从零到第一条调用 **≤2 分钟**、冷启动 **<10 秒（零网络）**。

| 编号 | 动作 | 内容 | 验收 | 优先级 |
| --- | --- | --- | --- | --- |
| A1 | 全局 bin 直调形态 | `npm i -g @yyc3/ai-family-agent` 后 mcpServers 用 `"command": "yyc3-family-server"` 替代 `npx`——避开 npx `preferOnline` 70 秒坑（§2.1 启示 1）；接入指南 §1.2 增补此形态为**首选**（npx 降为备选） | 断网冷启动 <10s | **P0** |
| A2 | 一键接入脚本 | `scripts/install-family-mcp.mjs`：检测 ZCode/Claude 配置文件 → 幂等注入 mcpServers 块（含绝对路径计量配置）→ 跑一分钟验证（§1.7）→ 输出报告。**密钥零落盘**（只写占位串） | 一条命令完成接入+验证 | **P0** |
| A3 | HTTP/SSE 常驻形态 | 在 serveMcpStdio 之外加 streamable HTTP 传输（对齐 2026-07-28 规范）——对标远程托管 7% 趋势与 mcp-remote 1.72M/周 | 同一服务双传输 | P1（随第二波令） |
| A4 | 金包分发公示 | `family-core-1.0.0.skill` 金包 digest 随 Release Notes 公示（M32 发布手册已有流程） | digest 可审计 | P1 |

### 形态 B · Skills 形态——协同流程层（procedure）

**目标**：ZCode/Claude 会话中提及家族/成员名号即触发协同闭环，**零网络、零配置依赖**。

| 编号 | 动作 | 内容 | 验收 | 优先级 |
| --- | --- | --- | --- | --- |
| B1 | 技能安装落地 | 解包 `yyc3-ai-family-coding.skill` → `~/.zcode/skills/yyc3-ai-family-coding/`（目录形态·四级发现路径最高级） | 会话提及「千行」即触发 | **P0** |
| B2 | 规范润色 | description 按 skill-creator 约定 pushy 化（触发信号前置、含成员名号与流程关键词）；核对 name 唯一性（与 brev-cli 等共存无冲突） | 重开会话元数据加载 | **P0** |
| B3 | 成员技能组（可选拆） | 主技能保持路由表（8 员一张表）；衍生 8 个 granular 成员技能供深度协同（如 `yyc3-qianhang`）——**人格定义单一事实源仍在 family-manifest.yaml**，技能只是视图 | `manifest:check` 零漂移 | P1 |
| B4 | marketplace 分发 | `.zcode-plugin/plugin.json` + marketplace.json，对齐 anthropics/skills 的 `/plugin marketplace add` 模式 | 外部仓库一键装 | P1 |

### 形态 C · 本地开发即插即用——开发者体验层（embed）

**目标**：新项目 10 分钟嵌入内核 / 衍生家族实例，全程 CLI 化。

| 编号 | 动作 | 内容 | 验收 | 优先级 |
| --- | --- | --- | --- | --- |
| C1 | 脚手架 | `create-yyc3-family-app`：拉最小模板（配置样例 + 启动器 + 门禁脚本）→ `pnpm start --selftest` 全绿。延伸 `create-member` 模板链 | 新仓一条命令可跑 | P1 |
| C2 | 内核消费样板 | `examples/embedded-kernel/`：`import { createRuntimeAssembly } from '@yyc3/ai-family-kernel'` 最小嵌入（注入 13 插拔点中 4 个必选） | 样板单测绿 | P1 |
| C3 | 十分钟开发手册 | 在接入指南补《开发者手册》：端口注入表（13 插拔点）→ 新成员四步 CLI → regression 门禁纪律 | 新开发者十分钟上手 | **P0** |

---

## 五、落地路线图

### P0（免解冻 · 本轮即可执行）

| 项 | 执行卡 | 依赖 | 风险 |
| --- | --- | --- | --- |
| A1 全局 bin 文档化 | 接入指南 §1.2/1.4 增补 `yyc3-family-server` 直调为首选形态 + 断网冷启动说明 | 无 | 低（文档级） |
| A2 一键接入脚本 | 新 scripts/install-family-mcp.mjs + 契约测试（幂等/零密钥落盘） | A1 | 中（写宿主配置文件——幂等+备份先行） |
| B1 技能安装 | 解包到 `~/.zcode/skills/yyc3-ai-family-coding/`（32KB·3 文件） | 无 | 低 |
| B2 润色重打包 | description pushy 化 → 重新打包 zip（确定性）→ 覆盖 docs 资产 | B1 | 低 |
| C3 开发者手册 | 接入指南补节 | 无 | 低 |
| **11-21 复核** | `cat data/metrics-usage.json` 对照判据表 | 用户日常使用 | — |

### P1（一周内 · 部分随第二波解冻令）

A3 HTTP 常驻形态 · A4 金包公示例行化 · B3 成员技能组 · B4 marketplace 分发 · C1 脚手架 · C2 内核样板。

### P2（第二波解冻令后 · 原队列）

判分第二批（语义/embedding 判分 · UAT 门控域）· E1a/E1c/E4c/E3a 解冻卡——封装方案不插队，P1 完成即回归主线。

---

## 六、红线与反模式（教科书纪律）

1. **三闸语义不削弱**：任何形态的 LLM 臂（A/B/C）同受 `LLM_STEP=1 + 确认串 + key` 门控——A2 脚本只写占位串，不写真值。
2. **8 人格不稀释**：B3 成员技能只是视图，人格/名号/职责单一事实源恒为 family-manifest.yaml；裂变/边缘成员走 E2a 管线。
3. **MCP 协议不动**：对齐 2026-07-28 规范子集；stdout 协议纯净性契约（H4）不因新传输形态回退。
4. **不刷量**：11-21 复核如实归因；接入脚本不做任何自动调用充数。
5. **密钥零落盘**：接入/安装脚本与文档全链无真值；真值只存 `~/.yyc3-keybackup/`（600）。
6. **反模式清单**：不学 MetaGPT/ChatDev 代码式 Role 类（下载近归零）；不把 Skill 与 MCP 混为替代关系（官方定位：互补）；不做私有协议分发（标准 MCP + 标准 skill 格式是生态通行证）。

---

## 七、附录

### A · 数据来源（关键项）

| 项 | 来源 |
| --- | --- |
| MCP 目录/下载 | [mcp.so](https://mcp.so) · [api.npmjs.org](https://api.npmjs.org/downloads/point/last-week/@playwright%2Fmcp) |
| 官方仓库 | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) · [typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) |
| Skills 规范 | [anthropics/skills](https://github.com/anthropics/skills) · [工程博客 2025-10-16](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) |
| 聚合 | [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) · [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) |
| 同类框架 | [OpenClaw](https://github.com/openclaw/openclaw) · [OpenHands](https://github.com/OpenHands/OpenHands) · [MetaGPT](https://github.com/FoundationAgents/MetaGPT) · [AutoGen](https://github.com/microsoft/autogen) · [CrewAI](https://github.com/crewAIInc/crewAI) · [CAMEL](https://github.com/camel-ai/camel) · [ChatDev](https://github.com/OpenBMB/ChatDev) |
| 摩擦实测 | [blog.peng.ly npx 70 秒实测](https://blog.peng.ly/cached-mcp-servers-ask-npm-first/) · [claude-code #60244](https://github.com/anthropics/claude-code/issues/60244) |
| 社区案例 | [HN Strata](https://news.ycombinator.com/item?id=45347914) · [HN InsForge](https://news.ycombinator.com/item?id=48181342) · [掘金 MCP 2026 讲透](https://juejin.cn/post/7678596150201335854) |

### B · 命令速查（本方案新增面）

```bash
pnpm pack:plugins && pnpm pack:check   # 金包装配与零漂移校验（形态 A4）
pnpm skills:gen && pnpm skills:check   # 技能产物生成与校验（形态 B3 事实源）
pnpm member:check                      # 家人模板零漂移（形态 C1 延伸）
pnpm regression                        # 全量门禁 367 例（一切变更后必跑）
```

---

**回链**：可复用性分析 v1.2.0（六形态盘点）· 接入与运维指南完整版（§1.2/§1.7 被本方案 A1/A2 增强）· M41.5 MCP 接入指南 · 观察窗复核报告 2026-11-16（零流量归因）· 演进集 v1.2.0 判据
