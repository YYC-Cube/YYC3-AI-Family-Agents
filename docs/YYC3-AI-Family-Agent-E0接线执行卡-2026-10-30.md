# YYC3-AI-Family-Agent E0 接线执行卡（消费端接线 · 可投放）

> **投放方式**：在 `/Users/yanyu/YYC-Cube/personal/YYC3-AI-FAmily-Agent/` 路径开新会话，将本文件全文作为首条指令投喂（或贴路径要求读取执行）。
> **编制**：元启·天枢 · 2026-10-30 · 自《演进提示词集 v1.1.1》拆出——本卡是当前唯一可执行项；E1-E5 全部冻结（编程暂缓令），解冻另行通知。
> **主线定位**：本卡即 0379-World 总账挂账 #1"消费端接线"的执行物——八家臣模型流量从智谱云切至本地网关，让入住率报表测本地大脑而非云账单。

---

## 〇、角色与使命

你是 **YYC³ 家族接线工程师**（受元启·天枢节制），在 TS 仓（v2.44.0，零运行时依赖，MCP/A2A 双协议）内完成 LLM 流量切换与计量就绪。**只做本卡三件事，不碰其他任何演进项。**

背景事实（已实证，勿重复调研）：
- 消费端画像：串行步骤、temperature 0、maxTokens 默认 1024、30s 超时、输出抽 JSON、无 tools/无多模态/不解析 reasoning_content。
- 当前模型面：`configs/base.yaml` `default_provider: zhipu`（云 glm-4-plus）；`.env` 含智谱明文 key（未入 git）；LLM 语义执行臂受三闸门控（LLM_STEP=1 + LLM_STEP_CONFIRM + API Key），缺省关闭。
- 协议层已就绪：`llm-adapter/openai-compatible-client.ts` 是标准 OpenAI 兼容（/chat/completions + SSE + 重试退避），本地网关可直接对接，**无需改动**。

## 一、前置信息获取（动手前先取到三个值）

| 需要 | 从哪取 |
|---|---|
| 33 网关 base_url（如 `http://<ip>:<port>/v1`） | `/Users/yanyu/YYC3-DGX-Spark/scripts/yyc3-fullstack-env.sh`（60 变量唯一端点源，找网关/local_dgx 相关变量） |
| 网关侧本地模型名 | 探测 `<base_url>/models`（一级=N1 :8000 Lightning；兜底=Ollama@77 自动发现 qwen3-coder-30b 优先） |
| 网关 API key | `~/.yyc3-keybackup/`（600）——真实密钥**绝不**写入任何文件/日志/git |

取不到任一值：停下报告，不猜测不硬编码。

## 二、任务三件（顺序执行）

### 任务 1 · E0a 本地网关接线
1. `configs/base.yaml`：`llm.providers` 增 `local` 档（`base_url`/`model` 经 `${LLM_STEP_BASE_URL}`/`${LLM_STEP_MODEL}` 注入，`timeout_ms` 保留 30000）。
2. `scripts/start-family-server.mjs`（provider 判定在 ~L82）：扩 `local` 分支——三闸门控完整保留，第三闸改为"网关 key 环境变量存在"。
3. `.env`：智谱 key 真值迁 `~/.yyc3-keybackup/zhipu.env`（600）；仓内 `.env` 只留变量名注释；确认 `.env.example` 有 local 档占位。
4. 联通自测：设三闸 + `LLM_STEP_BASE_URL`/`LLM_STEP_MODEL`，`pnpm start:selftest:llm` 走本地端点。

**验收**：`pnpm uat:llm` 5/5 通过且响应来自本地端点；`LlmUsageCounter.snapshot()` 有累计值；智谱云后台零新增调用。

### 任务 2 · E0b 计量分口径（报表口径地基）
1. `LlmUsageCounter.record()` 增可选 `tags`（`agentId`/`skillId`/`scenario`，默认空，向后兼容）。
2. `family-metrics.ts` 的 `recordLlmExecution` 联动打点；`/metrics`(:9464) 暴露三维分组计数器。
3. 一次多技能调用后验证可按三维聚合导出。

### 任务 3 · E0c 模型亲和三件套（为思考型模型预铺路，全部向后兼容）
1. `llm-adapter/types.ts`：`CompletionResponse` 增可选 `reasoningContent?: string`；`CompletionRequest` 增可选 `reasoning?: { enabled: boolean; budgetTokens?: number }`。
2. `openai-compatible-client.ts`：解析 `choices[0].message.reasoning_content` 透传（不参与 extractStepJson）。
3. `createLlmStepRunner` 的 `maxTokens=1024` 默认值改为 config 注入（base.yaml `llm.providers.*.max_tokens`；思考型档位建议 3072）。
4. 超时 30s 拉通配置（base.yaml `timeout_ms` → 适配器构造参数）。

**验收**：单测含 reasoning_content 样例响应（content 空而 reasoning 非空时不崩、可计量）；maxTokens 注入生效；旧调用路径零破坏。

## 三、推进流程图

```
┌───────────────────────────────────────────────┐
│ 预备：取三值（网关URL/模型名/key）——取不到即停 │
└────────────────────┬──────────────────────────┘
                     ▼
┌───────────────────────────────────────────────┐
│ 任务1 E0a：local provider + 三闸 + 密钥迁移    │
│         → pnpm uat:llm 5/5 本地端点           │
└────────────────────┬──────────────────────────┘
                     ▼
┌───────────────────────────────────────────────┐
│ 任务2 E0b：usage 三维 tags + /metrics 分组     │
│         → 多技能聚合导出验证                   │
└────────────────────┬──────────────────────────┘
                     ▼
┌───────────────────────────────────────────────┐
│ 任务3 E0c：reasoning 透传 + maxTokens/timeout  │
│         配置化 → 单测零破坏                    │
└────────────────────┬──────────────────────────┘
                     ▼
┌───────────────────────────────────────────────┐
│ 收口：typecheck+lint+test 全绿 → git commit    │
│  → usage 首日报（按三维）→ 总账回写一行        │
└───────────────────────────────────────────────┘
```

## 四、总验收（DoD）

①uat:llm 5/5 走本地；②智谱云零新增调用、key 真值只在 keybackup；③三维计量可聚合导出；④三件套单测通过且旧路径零破坏；⑤`pnpm typecheck && pnpm lint && pnpm test` 全绿；⑥commit 历史按任务分段；⑦usage 首日报落 docs/ 并回写 0379-World 总账一行。

## 五、红线

1. **只做本卡**：E1-E5 全部冻结（演进提示词集 v1.1.1 暂缓令），任何"顺手优化"都不做。
2. 不新增任何推理服务/部署；内核 `family-agents → architecture-kernel` 单向依赖不破坏。
3. 密钥纪律：真实 key 只存在 `~/.yyc3-keybackup`（600），文档/日志/git 零真值。
4. 三闸门控语义不削弱（本地端点也是"真实计费"——计的是自家 GPU 折旧）。
5. 卡点即停：网关信息取不到、uat 不过、测试红——停下写清现场，不猜不改红线。

## 六、完成后回写

1. 本仓 CHANGELOG 按既有风格记一笔；2. `docs/YYC3-AI-Family-Agent-演进提示词集-天枢-2026-10-30.md` 修订记录加"E0 已执行"行；3. `/Users/yanyu/YYC3-DGX-Spark/nvidia-workbench/docs/YYC3-0379-World-推进总账.md` 挂账 #1 更新一行（时间+结果+回链）。

---

**© 2025-2026 YYC³ Team · 天枢签发 · E0 完成即主线报表就绪**
