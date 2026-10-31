# YYC³ AI Family · LLM Usage 首日报（E0b 基线）

> **日期**：2026-10-30（当日二次升级 live 版） · **口径版本**：E0b 计量分口径 · **状态**：**live 数据版（E0a 已验收 · 真实流量来自本地网关）**
> **编制**：家族接线工程师 · 依《E0 接线执行卡》（元启·天枢签发）

## 一、口径（E0b 已落地）

- **采集点**：`LlmUsageCounter.record(usage, tags?)`——provider 真实返回 usage 逐调用累计；三维标签 `agentId / skillId / scenario`（缺省归 `unknown`）。
- **暴露**：`/metrics`（:9464）两组计数器——
  - `family_llm_usage_tokens_total{agent_id,skill_id,scenario}`（token 总量，prompt+completion）
  - `family_llm_usage_calls_total{agent_id,skill_id,scenario}`（调用次数）
- **联动点**：`family-server` baseDispatch 语义执行分支——每次技能执行的 usage **增量**按 `skillId` / `scenario=llm-assisted` 上报（agentId 由部署侧按调用方补齐）。
- **聚合导出**：Prometheus 标准——按任意标签维度 `sum by(...)` 即得入住率报表口径（如 `sum by(skill_id)(family_llm_usage_tokens_total)`）。

## 二、首期数据（2026-10-30 · live 版）

| 场景 | 数据 | 说明 |
| --- | --- | --- |
| **本地网关（Tailscale :10086 · nemotron-3.5-super-vl）** | **uat:llm 5/5 · selftest 3 技能 5/5 字段填充 · 累计 3290 tokens** | **E0a live 验收通过（2026-10-31）**；三维计数器真值：family_llm_usage_tokens_total{skill_id="bole.achievement-insight"} 667 等 |
| zhipu 云（glm-4-flash） | 0 tokens（key 429 余额不足，未再触碰） | 云通道停用中——**云账单零新增实证** |
| 本地桩（契约测试） | 单测级 45 tokens / 3 次（分桶断言） | llm-provider.spec E0c-3 |

## 二b、首期数据（基线版 · 留档）

| 场景 | 数据 | 说明 |
| --- | --- | --- |
| zhipu 云（glm-4-flash） | **0 tokens**（2 次调用全部 429 拒绝） | 智谱 key 轮转后**余额不足**（code 1113）——云通道实际不可用，**如实记 0** |
| 本地网关（:8000 / :8001） | 未产生 | 网关 key 未签发（401/403）——E0a live 验收挂起（见 §四现场） |
| 本地桩（契约测试） | 单测级：45 tokens / 3 次调用（三维分桶断言通过） | `llm-provider.spec` E0c-3 |

> 首期**零真实消耗**本身即结论：云账单风险已归零（key 失效 + 流量未切），切换动机与安全性同时成立。

## 三、验收对照（执行卡 DoD ③）

- ✅ 三维计量可聚合导出：counter 三维标签 + 单测断言（`E0c-3` 分桶 / `M11` 渲染含标签序）
- ✅ 多技能调用聚合：`baseDispatch` 增量联动按 skillId 分桶（`family-server.entry.ts`）
- ⏳ 真实多技能流量：待 E0a live 验收通过后首日报升级为真实数据版

## 四、现场（E0a 卡点 · 红线 5 如实记录）

- `GATEWAY_LAN http://192.168.3.45:8000`：**存活**；无鉴权 401、候选 key（`DS_FLAGSHIP_KEY=sk-yyc3-local-dsv4` 占位钥 / `FAMILY_AUTH_TOKEN`）均 403 invalid
- `DS_FLAGSHIP_URL http://100.65.64.49:8001/v1`（N1 旗舰直连）：**不可达**（Tailscale 000）
- `CODER77_URL`：可达但仅 embed 模型（`qwen3-coder-30b` 不在位——卡片兜底假设已过期）
- **待办**：网关侧签发有效 API key（或确认免鉴权网段）→ 设三闸 + `LLM_STEP_PROVIDER=local LLM_STEP_BASE_URL=<网关>/v1 LLM_STEP_MODEL=<模型>` → `pnpm start --selftest:llm` + `pnpm uat:llm` 一条命令完成 live 验收

## 五、接线就绪清单（本卡已交付代码）

- `configs/base.yaml`：`llm.providers.local` 档（含 `max_tokens` / `timeout_ms`，思考型建议 3072）
- `start-family-server.mjs`：`local` 分支（第三闸 = `LOCAL_GATEWAY_API_KEY` 存在）+ base.yaml 档位注入（max_tokens/timeout_ms）+ 密钥兜底链（env → keybackup → .env）
- 密钥迁移：智谱 key 真值已迁 `~/.yyc3-keybackup/zhipu.env`（600），仓内 `.env` 仅注释
- `LlmUsageCounter`：三维 tags 分桶 + 快照；`FamilyMetrics.recordLlmUsage` + `/metrics` 双计数器
- `reasoning` 请求透传 + `reasoning_content` 响应透传（content 空不崩 · 可计量）；`maxTokens` 配置注入

---

**© 2025-2026 YYC³ Team · E0b 基线报 · 下期升级为真实数据版（本地网关 live 后）**
