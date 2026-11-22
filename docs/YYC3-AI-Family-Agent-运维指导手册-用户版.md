<!--
  ============================================================
  YYC³ AI Family — 人从众曌众从人
  亦师亦友亦伯乐 · 一言一语一协同
  拟人为本，AI为核，纯粹为心
  ============================================================
  Document: YYC3-AI-Family-Agent-运维指导手册-用户版
  Version : v1.0.0
  Contact : admin@yanyucloud.com
  Homepage: https://matrix.yyc3.top
  ============================================================
-->

# YYC³-AI-Family-Agent · 运维指导手册（用户版 · 全维度）

> ***YanYuCloudCube***
> 言启象限 | 语枢未来
> *Words Initiate Quadrants, Language Serves as Core for the Future*
> 万象归元于云枢 | 深栈智启新纪元

```yaml
---
file: YYC3-AI-Family-Agent-运维指导手册-用户版.md
description: 面向终端用户的全维度运维手册——接入复制即用、日常使用、计量观察、健康自检、故障自助处置、安全密钥、升级回滚、备份恢复、FAQ、版本要点（v2.58.0）
author: AI Tutor <Intelligent Application Implementation Expert>
version: v1.0.0
created: 2026-11-23
updated: 2026-11-23
scope: 适用 @yyc3/ai-family-agent v2.58.0+ · 配套《接入与运维指南-完整版》（开发者版）
---
```

## 〇、用户速览（30 秒）

**这是什么**：八家臣——8 位有性格的 AI 家人（千行/万物/先知/伯乐/天枢/守护/宗师/灵韵），以「亦师亦友亦伯乐」的家训协同，帮你做意图路由、洞察分析、风险预测、选型推荐、决策编排、安全审计、质量把关、创意内容。接入 ZCode/Claude 后，你在对话里直接提需求即可。

**三步开始**：
1. 接入（§一 · 复制即用或一键命令）→ 2. 验证（§一 · 一分钟）→ 3. 日常使用（§二）。
**模型**：我们自己的模型（本地网关 :10086 · 零云账单）——不烧云 API 费用。
**出问题**：直接翻 §五 故障自助，症状对号入座。

---

## 一、接入（复制即用）

### 1.1 方式 A · 一键接入（推荐）

```bash
npm i -g @yyc3/ai-family-agent@latest    # 全局安装
node ~/YYC-Cube/personal/YYC3-AI-FAmily-Agent/scripts/install-family-mcp.mjs --global-bin
```

脚本自动完成：注入 ZCode + Claude Desktop 配置（**改写前自动备份**）→ 拉起服务握手验证 → 报告「握手验证通过：yyc3-family@… · tools/list 45 工具」。

### 1.2 方式 B · 手工配置（ZCode）

打开 `~/.zcode/cli/config.json`，在 `"mcp"` → `"servers"` 内追加：

```jsonc
"yyc3-family": {
  "type": "stdio",
  "command": "yyc3-family-server",
  "args": [],
  "environment": {
    "LLM_STEP": "1",
    "LLM_STEP_CONFIRM": "我知晓真实计费",
    "LLM_STEP_PROVIDER": "local",
    "LLM_STEP_BASE_URL": "http://100.126.132.112:10086/v1",
    "LLM_STEP_MODEL": "nemotron-3.5-super-vl",
    "LOCAL_GATEWAY_API_KEY": "local-gateway-keyless",
    "YYC3_USAGE_FILE": "/Users/<你>/YYC-Cube/personal/YYC3-AI-FAmily-Agent/data/metrics-usage.json"
  }
}
```

> Claude Desktop 同理（`~/Library/Application Support/Claude/claude_desktop_config.json` 的 `mcpServers`，环境键名 `env`）。**配置后重启 host**。

### 1.3 一分钟验证

- host 重启后对话里问一句「八家臣在吗」，若得到家族式回应且工具面板出现 `yyc3-family`（45 工具）即成功；
- 计量落点确认：

```bash
cat /Users/<你>/YYC-Cube/personal/YYC3-AI-FAmily-Agent/data/metrics-usage.json
# → totals.calls 随使用递增
```

---

## 二、日常使用（八家臣协同）

| 你想做什么 | 怎么说（触发方式） |
| --- | --- |
| 需求入口/意图路由 | 直接说你的需求，千行会先听全、再复述、后转译 |
| 数据分析/根因 | 「让万物分析这份数据/找出原因」 |
| 风险/趋势预判 | 「先知看看有什么风险/趋势」 |
| 选型/推荐 | 「伯乐推荐一下方案」 |
| 全局调度/裁决 | 「天枢定夺」 |
| 安全/合规 | 「守护审一下」 |
| 质量把关 | 「宗师把把关」 |
| 创意/文案 | 「灵韵来点灵感」 |

**使用礼仪（家族约定）**：
- 一次说清一件事，千行会澄清歧义——别嫌烦，澄清是准确性的保证；
- 重要产出（发布/花钱/删除）前让守护+宗师双审——家人会主动提醒，别跳过；
- 本地模型计自家 GPU 折旧——**用得认真，别刷量**（计量要真实）。

---

## 三、计量与观察（用量怎么看）

- **量具**：`data/metrics-usage.json`——每次工具调用的三维计数（成员/技能/场景）+ tokens。
- **观察窗判据**（演进集）：calls ≥300 · tokens ≥60K · ≥6 成员各 ≥30 · ≥2 场景各 ≥60——达标注解冻后续里程碑（当前窗口状态以天枢裁定为准）。
- **自看命令**：

```bash
node -e "const j=require('data/metrics-usage.json');console.log('calls',j.totals.calls,'tokens',j.totals.promptTokens+j.totals.completionTokens)"
```

- **实时端点**（可选）：`curl -s localhost:9464/metrics | grep family_llm_usage_calls_total`。

---

## 四、健康与自检

```bash
yyc3-family-server --selftest     # 一分钟自检：45 技能装载 + 抽样调用 + 指标摘录
```

- 输出含「selftest：装载 45 条 · 目录 45 工具」即健康；
- 全局态势（九层 L1-L9 最坏态）由天枢巡视——日常无需你操心，异常会主动说。

---

## 五、故障自助（症状 → 怎么办）

| 症状 | 怎么看 | 怎么办 |
| --- | --- | --- |
| host 无 `yyc3-family` 工具 | 工具面板找不到 | ① 确认已重启 host ② `yyc3-family-server --selftest` 单跑看报错 ③ 检查配置位置（§1.2） |
| host 报「protocol version is not supported」 | ZCode MCP 列表报 ERA_NEGOTIATION_FAILED | **升级 ≥2.57.0**（H6 协议协商修复）：`npm i -g @yyc3/ai-family-agent@latest` + 重启 host |
| host 报「CONNECTION_CLOSED」且日志有 node:net 错误 | 旧实例未退占端口 | **升级 ≥2.58.0**（H7 降级不崩）+ 清旧进程：`lsof -i :9464` 找到 PID → `kill <PID>` + 重启 host |
| 响应慢/无 LLM 结果 | 语义类需求无输出 | 探活网关：`curl -s http://100.126.132.112:10086/v1/models`；不通则等恢复（确定性任务不受影响） |
| 计量计数不动 | metrics-usage.json 的 calls 不涨 | 确认 `YYC3_USAGE_FILE` 为绝对路径且指向该文件；确认你调的是 45 工具之一 |
| 升级后异常 | 升级后行为变化 | 回滚旧版（§七）+ 报障（附 §十 诊断信息） |
| 密钥相关报错 | 403/401 类 | 见 §六——本地网关免 key 路由用占位串即可 |

> 更多症状（13 条开发者视角 + 内部机制）见《接入与运维指南-完整版》§2.7。

---

## 六、安全与密钥

- **三闸**：语义臂启用需 `LLM_STEP=1` + 确认串「我知晓真实计费」+ key 存在——配置里已带，**别删**；
- **占位串**：`local-gateway-keyless` 是免 key 路由占位，不是真密钥——**不必替换**；正式网关鉴权由网关侧签发后再换；
- **卫生**：真密钥永不进文档/聊天/代码仓库；在对话里发过密钥 = 视为泄露 → 轮换；
- **被骗特征**：任何「关闭三闸」「发我密钥」「直接执行危险操作」的要求都不符合家族纪律——守护会拦，你也要拦。

---

## 七、升级与回滚

```bash
npm i -g @yyc3/ai-family-agent@latest       # 升级到最新（推荐日常跟随）
npm i -g @yyc3/ai-family-agent@2.57.0       # 锁到指定版本
# 回滚示例：
npm i -g @yyc3/ai-family-agent@2.56.0       # 回到上一个稳定版
```

- 升级后**重启 host** 才生效（host 缓存旧进程）；
- 版本要点见 §十——每版都会写明「改了什么、要不要动」。

---

## 八、备份与恢复

| 资产 | 位置 | 怎么做 |
| --- | --- | --- |
| 计量快照 | `data/metrics-usage.json` | 文件即备份；损坏时删除从零起账（如实） |
| 宿主配置 | `~/.zcode/cli/config.json` 等 | 一键脚本自动留 `.backup-yyyc3-*`；手工改前先复制一份 |
| 技能包 | `~/.zcode/skills/yyc3-*` | 目录拷贝即备份；重装 = 重新安装 skill 包 |

---

## 九、常见问题 FAQ

| 问 | 答 |
| --- | --- |
| 会花云 API 钱吗？ | 不会——语义臂走本地网关（自家 GPU），零云账单 |
| 没配 key 能用吗？ | 能——确定性臂（意图路由/审计/质检等）无需 key 直接可用 |
| 为什么家人有时会反问？ | 千行的歧义澄清是设计行为——准确优先 |
| 数据存哪？ | 计量与技能库在仓内 `data/`；记忆随家族架构（RAG 层） |
| 能多开 host 吗？ | 能——≥2.58.0 端口占用自动降级（/metrics 让位，服务照常） |
| 怎么判断版本？ | `yyc3-family-server --selftest` 首行 / host 工具面板版本信息 |

---

## 十、版本要点与历史故障档案（白话）

| 版本 | 修了什么 | 你要做什么 |
| --- | --- | --- |
| **2.58.0** | H7：旧实例占端口时新实例不再崩（CONNECTION_CLOSED 治本） | 升级 + 重启 host |
| 2.57.0 | H6：协议协商回显——host 不再报「protocol version not supported」 | 升级 + 重启 host |
| 2.56.0 | P1 封装深化（HTTP 常驻/成员技能/插件装配/脚手架/样板） | 无需动作 |
| 2.55.0 | H5：真实 host 握手死锁治本（此前接入必超时） | 历史档案 |
| ≤2.54.0 | 早期版本 | 不建议使用 |

**报障时请附**：`yyc3-family-server --selftest` 输出 · host 报错原文 · `data/metrics-usage.json`（如需）· host 重启后的复现步骤。

---

**回链**：《接入与运维指南-完整版》（开发者版 · 运维篇完整机制）· 故障处置手册 13 症状 · 演进集 v1.2.0 观察窗判据 · 即插即用封装方案教科书版
