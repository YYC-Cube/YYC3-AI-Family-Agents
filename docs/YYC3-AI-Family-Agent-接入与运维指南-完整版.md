# YYC³ AI Family Agent · 接入与运维指南（完整落地版）

> ***YanYuCloudCube***
> 言启象限 | 语枢未来

```yaml
---
file: YYC3-AI-Family-Agent-接入与运维指南-完整版.md
description: 八家臣 MCP 服务（@yyc3/ai-family-agent）的接入动作（复制即用）与完整运维手册（计量/评测/发布/安全/故障处置/备份回滚/升级）
author: AI Tutor <Intelligent Application Implementation Expert>
version: v1.0.0
created: 2026-11-11
updated: 2026-11-11
scope: 适用 v2.54.0+（npm @yyc3/ai-family-agent@2.54.0 · @yyc3/ai-family-kernel@2.54.0）
---
```

## 〇、快速心智模型（30 秒）

```
你（host：ZCode / Claude Desktop / 任意 MCP client）
  └─ mcpServers 配置拉起 npx yyc3-family-server（MCP stdio · 逐行 JSON-RPC）
       └─ 八家臣 45 技能（确定性臂直接执行 · LLM 语义臂走我们自己的模型）
            └─ 本地网关 :10086（nemotron-3.5-super-vl · 零云账单）
       └─ 每次调用 → usage 三维计量 → data/metrics-usage.json 跨进程累计
  （host 断开 → 排空响应 → 落盘快照 → 退出；下次会话从快照恢复续账）
```

- **身份**：八家人格是定数（不可稀释）；裂变/边缘成员走 E2a 管线另行产出。
- **模型**：我们自己的模型（本地网关）——接入即零云账单；智谱云通道停用中。
- **计费语义**：本地推理计自家 GPU 折旧，三闸确认照常（红线不削弱）。

---

# 第一部分 · 接入篇（复制即用）

## 1.1 前置条件

| 项 | 要求 | 核验 |
| --- | --- | --- |
| Node | ≥ 20 | `node -v` |
| 本地网关 | `:10086` 存活且模型在位 | `curl -s http://100.126.132.112:10086/v1/models` |
| npm（npx 形态） | 公开包无需登录 | `npm view @yyc3/ai-family-agent version` → 2.54.0 |
| 磁盘 | `data/` 可写（计量快照 + 技能库落盘） | 相对 cwd；建议绝对路径配置 |

## 1.2 ZCode 接入（`mcpServers` 块 · 复制即用）

在 ZCode 的 MCP 配置（`~/.zcode/settings.json` 或项目级）加入：

```jsonc
{
  "mcpServers": {
    "yyc3-family": {
      "command": "npx",
      "args": ["-y", "@yyc3/ai-family-agent@latest"],
      "env": {
        "LLM_STEP": "1",
        "LLM_STEP_CONFIRM": "我知晓真实计费",
        "LLM_STEP_PROVIDER": "local",
        "LLM_STEP_BASE_URL": "http://100.126.132.112:10086/v1",
        "LLM_STEP_MODEL": "nemotron-3.5-super-vl",
        "LOCAL_GATEWAY_API_KEY": "local-gateway-keyless",
        "YYC3_USAGE_FILE": "/Users/<你>/YYC-Cube/personal/YYC3-AI-FAmily-Agent/data/metrics-usage.json"
      }
    }
  }
}
```

要点：`YYC3_USAGE_FILE` 用**绝对路径**（host 拉起的 cwd 不可控）；`LOCAL_GATEWAY_API_KEY` 占位即可（`/v1` 免 key），正式鉴权走网关侧 apiKeys 签发后替换真值。

## 1.3 Claude Desktop 接入

配置文件：`~/Library/Application Support/Claude/claude_desktop_config.json`（macOS），`mcpServers` 块与 1.2 完全一致（复制即用）。保存后重启 Claude Desktop，工具面板出现 `yyc3-family` 即接入成功。

## 1.4 npm 全局形态（脱离 host 独立使用）

```bash
npm i -g @yyc3/ai-family-agent
export LLM_STEP=1 LLM_STEP_CONFIRM=我知晓真实计费 LLM_STEP_PROVIDER=local \
  LLM_STEP_BASE_URL=http://100.126.132.112:10086/v1 LLM_STEP_MODEL=nemotron-3.5-super-vl \
  LOCAL_GATEWAY_API_KEY=local-gateway-keyless
echo '{"serverInfo":{"name":"demo","version":"1.0.0"},"tools":[],"manifestEntries":[]}' | yyc3-family-server
# 随后向 stdin 写 JSON-RPC 行（见 2.1 协议帧）
```

## 1.5 仓内开发形态（真身区）

```bash
cd ~/YYC-Cube/personal/YYC3-AI-FAmily-Agent
pnpm start            # 常驻（含学习闭环/九层态势环/本地网关缺省接线）
pnpm start --selftest # 一分钟自检（45 技能装载 · A2A 委托采样）
pnpm regression       # 全量门禁（364+ 例 · 变更后必跑）
```

## 1.6 配置字段速查（FamilyServerConfig 核心子集）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `serverInfo` | `{name, version}` | MCP initialize 返回的 server 身份 |
| `tools` / `manifestEntries` | 数组 | 工具目录与技能清单（npm 形态随包 presets 注入） |
| `llm` | `{provider: 'local'\|'zhipu'\|'openai', model, baseUrl, maxTokens, timeoutMs, apiKeyEnv}` | 语义臂档位（local = 我们自己的模型） |
| `usagePersist` | `{file, flushEvery?}` | 计量快照（启动恢复 + 原子落盘 + stop 落盘） |
| `learning` | `{store/storeDir, scheduler, nineLayer}` | 学习闭环 + 九层态势环（缺省关） |
| `metricsServer` | `{port(9464), host, authToken?}` | /metrics Prometheus 端点 |
| `admission` | observe/enforce | 工具准入（缺省 observe 放行留痕） |
| `external` | A2A 实例契约 | 外部家人委托（card 发现 + 能力闸） |

## 1.7 一分钟验证（接入后必做）

```bash
# ① host 日志（stderr）应见：
#    YYC³ 家族服务已就绪（MCP stdio · 技能 N · /metrics …）
# ② host 对话里调用任一工具（如 qianhang 的意图分类）
# ③ 计量落点（判据量具）：
cat data/metrics-usage.json
# → totals.calls 递增 · buckets 按 skill_id/scenario 分桶
# ④（可选）Prometheus 核验：
curl -s localhost:9464/metrics | grep family_llm_usage_calls_total
```

---

# 第二部分 · 运维篇（完整版）

## 2.1 服务生命周期

- **stdio 语义**：host 拉起 → 逐行 JSON-RPC → host 断开 stdin → 排空在途响应 → `stop()`（落盘快照）→ 退出。SIGINT/SIGTERM 同路径；`exit` 钩子兜底同步落盘。
- **进程内计数器**：随进程清零——**跨进程累计以 `data/metrics-usage.json` 为准**（2.2）。
- **优雅停止**：host 侧关闭即可；独立形态 `Ctrl+C`。强杀（kill -9）最多丢最近 <5 次调用计量（flushEvery=5），技能库不受影响（每次变更即时落盘）。

## 2.2 计量与观察窗（判据量具）

- **判据**（演进集 v1.2.0 · 窗口至 **2026-11-14 24:00**）：`calls_total ≥ 300` 且 `tokens ≥ 60K` 且 覆盖 ≥6 员（单员 ≥30）且 ≥2 场景各 ≥60。
- **核验**：

```bash
node -e "const j=require('data/metrics-usage.json'); const c=j.totals.calls, t=j.totals.promptTokens+j.totals.completionTokens; console.log('calls',c,'tokens',t,'成员',new Set(j.buckets.map(b=>b.skillId)).size)"
```

- **未达处置**：按演进集判据顺延一周（≤2 轮）并在总账归因（首例：11-07 终局报告——真无流量）。**不为凑数刷量**（污染报表语义）；救济 = 真实接入后日常使用。
- **报表口径**：`/metrics` 三维分组（agent_id/skill_id/scenario）——`sum by(skill_id)(family_llm_usage_tokens_total)` 即入住率报表粒度；画像分口径标签 `llm-assisted@<profileId>`（E4a）直接可聚合。

## 2.3 健康面与态势

| 面 | 入口 | 说明 |
| --- | --- | --- |
| Prometheus | `:9464/metrics`（authToken 可选） | family_llm_usage_* / capability / healing / circuit_state |
| 全局态势 | `situation()`（句柄）| 九层 L1–L9 健康最坏态推导（L1 技能库/L5 分派失败/L8 熔断/L9 调度积压内置探针） |
| 五支柱面板 | `ops/observability/pillar-dashboard/index.html` | 回归门禁生成 · file:// 直开 |
| 自检 | `pnpm start --selftest`（+`--selftest:llm` LLM 采样） | 45 技能装载 · A2A 委托 · usage 输出 |

## 2.4 golden 评测（模型/网关变更前必跑）

```bash
UAT_LLM=1 UAT_LLM_CONFIRM=我知晓真实计费 UAT_LLM_ALLOW_HTTP=1 \
UAT_LLM_BASE_URL=http://100.126.132.112:10086/v1 UAT_LLM_MODEL=nemotron-3.5-super-vl \
UAT_LLM_API_KEY_ENV=LOCAL_GATEWAY_API_KEY LOCAL_GATEWAY_API_KEY=local-gateway-keyless \
UAT_LLM_EVAL_BASELINE=docs/YYC3-AI-Family-Agent-golden基线-nemotron-3.5-super-vl-2026-11-02.json \
pnpm uat:llm --eval
```

产出 `docs/…golden基线-<模型>-<日期>.md`（准确率/时延/费用 + diff）。当前基准：**91/92 = 98.9%**（题库 v3 · M40 判分 · B27 挂题=模型特性）。

## 2.5 发布运维（npm · 双包）

```bash
pnpm pack:npm                                  # ① 确定性装配（版本随根 · SHA256SUMS 重算）
cd dist/ai-family-kernel && npm publish --access public   # ②④ 发布
cd ../ai-family-agent    && npm publish --access public
# ③ digest 公示：dist/SHA256SUMS.txt 随 Release Notes / 运维记录归档
# registry 传播 ~5 分钟；验证：npm view @yyc3/ai-family-agent version
```

- **版本纪律**：双包版本恒与根仓同步（红线断言）；MINOR 随 PR、PATCH 留 hotfix。
- **token 卫生**：classic token 会话留痕即暴露——**用完即撤销**；建议 granular + 终端注入（历史教训：2026-11-02 双 token 暴露，11-10 轮换完成）。
- **已发布**：2.52.0（首发）→ **2.54.0**（M41 持久化 + M41.5 serve 循环 · 当前 latest）。

## 2.6 安全运维

- **密钥纪律**：真值只存 `~/.yyc3-keybackup/`（600）或密钥服务；源码/配置样例/文档零真值；对话传递过即视为暴露 → 轮转。
- **三闸门控**：`LLM_STEP=1` + `LLM_STEP_CONFIRM=我知晓真实计费` + key 存在——host env 块承载；语义不削弱。
- **准入**：`YYC3_ADMISSION_MODE=enforce` 时未准入工具硬拒（缺省 observe 放行留痕）；`planned` 技能不装载。
- **审计**：compliance-audit 全链留痕；审计不可篡改，越权上报不代罚。

## 2.7 故障处置手册（症状 → 诊断 → 处置）

| 症状 | 诊断 | 处置 |
| --- | --- | --- |
| host 无 `yyc3-family` 工具 | bin 未拉起 / npx 失败 | `npx -y @yyc3/ai-family-agent@latest --selftest` 单跑看 stderr |
| LLM 步骤 isError：ECONNREFUSED | 本地网关/上游掉线（如 svl2 维护） | 探活 `/v1/models`；恢复后重跑 golden（BASELINE diff） |
| LLM isError 429（智谱 1113） | 云 key 余额不足 | 预期内（已切本地）——勿充值续云，走 local 档 |
| LLM isError 403 invalid | 网关 key 失效 | 换网关侧签发 key 或占位钥（免 key 路由） |
| 意图分类结果漂移 | 模型自由措辞 vs 窄判分 | 非 bug：B27 类单题挂=模型特性；语义判分第二批在册 |
| 计数器归零 | 进程重启（内存态） | 正常——累计看 `data/metrics-usage.json`（2.2） |
| 快照文件损坏 | 写盘中断（罕见·原子写） | 删除文件 → 从零起账（如实） |
| npm publish `cannot publish over` | 版本已存在 | bump 版本（MINOR/PATCH）重走四步（i18n-Core 3.5.0 同理） |
| npm 401 | 登录态失效/token 撤销 | 重新登录或换 token（granular 建议） |
| 打包产物条目数漂移 | `.DS_Store` 混入打包源 | 删除系统文件（pack-plugin 已过滤治本） |
| regression 红：静默 spec | 库函数内 `process.exit` 杀测试进程 | 用 onClose 回调注入（M41.5 范式）· 勿在库内 exit |
| Mimosa high 拦截 | 模式判定（路径穿越/命令向量/SSRF） | argv 字面量化 / env 中转 / 执行体移 .mjs runner / safeJoin（勿硬闯） |

## 2.8 备份与恢复

| 资产 | 位置 | 方式 |
| --- | --- | --- |
| 计量快照 | `data/metrics-usage.json` | 文件即备份；损坏删档从零起账（如实） |
| 技能库（学习固化） | `data/skills/`（FileSkillStore） | 目录拷贝；回滚走 `SkillRollbackPort`（版本翻转） |
| 外部 Worker 契约 | `presets/external-worker/*.worker.yaml` | git 版本化 |
| 保护规则 | `/tmp/yyc3-family-main-protection-backup-20261030.json`（易失） | 回滚命令在 CHANGELOG Fixed（0 批准 + CI strict 现状） |

## 2.9 升级路径

- **host 侧**：`@latest` 自动跟随（npx 缓存建议 `npx -y @…@2.54.0` 锁版或清 npx 缓存）；MINOR 升级零迁移（配置字段向后兼容）。
- **仓侧**：MINOR 随 PR 递增；publish 前必过 `pnpm regression` + W0 安审（M32 预检）。
- **回滚**：npm `dist-tags` 指回旧版（`npm dist-tag add @yyc3/ai-family-agent@2.53.0 latest`）；仓内 `git revert` + PR。

## 附录 A · 环境变量总表（运行面）

| 变量 | 缺省 | 说明 |
| --- | --- | --- |
| `LLM_STEP` / `LLM_STEP_CONFIRM` | 未设 | 三闸之一/二（必须为 1 / 我知晓真实计费） |
| `LLM_STEP_PROVIDER` | 按 key 判定 | local / zhipu / openai |
| `LLM_STEP_BASE_URL` / `LLM_STEP_MODEL` | — | 网关端点 / 模型名（local 档必给） |
| `LLM_STEP_TIER` | flagship | 模型档位占位（reasoning/flagship/speed · 拍板后回填） |
| `LOCAL_GATEWAY_API_KEY` | — | 网关 key（/v1 免 key 时占位） |
| `YYC3_USAGE_FILE` / `YYC3_USAGE_FLUSH_EVERY` / `YYC3_USAGE_PERSIST` | data/metrics-usage.json / 5 / 启用 | 计量持久化 |
| `YYC3_METRICS_PORT` / `HOST` / `TOKEN` | 9464 / 127.0.0.1 / — | /metrics 端点 |
| `YYC3_ADMISSION_MODE` | observe | observe \| enforce |
| `UAT_LLM*` / `EXT_WORKER*` | — | UAT 三闸（评测/外部端点，不入 CI） |

## 附录 B · 命令速查

```bash
pnpm regression            # 全量门禁（367 例 · 53 套件 · 变更后必跑）
pnpm start [--selftest]    # 常驻服务 / 自检
pnpm uat:llm [--eval]      # LLM 实答 UAT / golden 三卷对比（三闸）
pnpm uat:external          # 外部 Worker UAT（AUTOSTART=1 自动拉起）
pnpm member:check          # 家人模板零漂移（9 成员）
pnpm profiles:check        # 业务域卡校验（8 卡 · 人格红线）
pnpm pack:npm              # npm 双包装配 + SHA256SUMS
cat data/metrics-usage.json # 观察窗判据量具
```

---

**回链**：M41 计量持久化 · M41.5 接入形态 · 演进集 v1.2.0 观察窗判据 · 《可复用性分析》§六发布手册
