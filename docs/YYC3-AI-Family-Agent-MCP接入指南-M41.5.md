# YYC³ · MCP Host 接入指南（M41.5 · ZCode / Claude Desktop 直连）

> **形态**：`@yyc3/ai-family-agent`（npm bin `yyc3-family-server`）= MCP stdio server——host 按需拉起、逐行 JSON-RPC、断开即停。
> **模型**：**我们自己的模型**——本地网关（Tailscale `:10086` · `nemotron-3.5-super-vl` · `/v1` 免 key 即用），零云账单。
> **计量**：`usagePersist` 打开 → `data/metrics-usage.json` 跨进程累计（观察窗判据量具 · 11-14 复核）。

## 一、ZCode / Claude Desktop 配置（`mcpServers` 块）

```jsonc
{
  "mcpServers": {
    "yyc3-family": {
      "command": "npx",
      "args": ["-y", "@yyc3/ai-family-agent@latest"],
      "env": {
        // —— 我们自己的模型（本地网关 · 三闸等价配置）——
        "LLM_STEP": "1",
        "LLM_STEP_CONFIRM": "我知晓真实计费",
        "LLM_STEP_PROVIDER": "local",
        "LLM_STEP_BASE_URL": "http://100.126.132.112:10086/v1",
        "LLM_STEP_MODEL": "nemotron-3.5-super-vl",
        "LOCAL_GATEWAY_API_KEY": "local-gateway-keyless",  // /v1 免 key；正式 key 走网关 apiKeys 签发
        // —— 计量持久化（观察窗判据量具 · 路径建议绝对）——
        "YYC3_USAGE_FILE": "/Users/<你>/YYC-Cube/personal/YYC3-AI-FAmily-Agent/data/metrics-usage.json"
      }
    }
  }
}
```

> **三闸语义不削弱**（红线）：host 场景的三闸 = 配置文件内 `LLM_STEP=1` + 确认串 + key 环境变量——与终端形态同构，本地推理计自家 GPU 折旧也是「真实计费」。

## 二、工作原理

```
host（ZCode / Claude）拉起 npx yyc3-family-server
  → bin 管道 stdin ↔ 子进程 entry
  → entry 读 stdin 首行配置 JSON（host 侧 env 由 provider 三闸自取）
  → serveMcpStdio：逐行 JSON-RPC（initialize/ping/tools/list/tools/call）
  → 确定性臂直接执行；LLM 步骤经本地网关语义执行（usage 计量）
  → 分派完成发 task.executed 总线事件（学习闭环 + usage 三维计数 + M41 持久化落盘）
  ← host 断开 stdin → 排空响应 → stop（落盘快照）→ 退出
```

- **stdout 纯净性**：协议帧之外一切输出走 stderr（横幅/日志）——host 解析不受污染（契约 H4 在档）。
- **计量**：每次工具调用 → `family_llm_usage_{tokens,calls}_total{agent_id,skill_id,scenario}` + 快照文件落盘（每 5 次原子写 · stop 必写 · 任意退出 exit 钩子兜底）。

## 三、验证（接入后 1 分钟自检）

```bash
# host 日志应见：YYC³ 家族服务已就绪（MCP stdio · 技能 N · /metrics …）
# 调用任一工具后：
cat /Users/<你>/YYC-Cube/personal/YYC3-AI-FAmily-Agent/data/metrics-usage.json
# → totals.calls 递增 · buckets 按 skill_id/scenario 分桶（11-14 观察窗判据的量具）
```

## 四、注意

- `npx -y @yyc3/ai-family-agent@latest` 首次安装需 npm 登录态无关（公开包）；离线可 `npm i -g` 后直用 bin 名。
- 家族技能为确定性执行臂（缺省）+ LLM 语义臂（配置即启用）——语义臂调用走上面 env 指的本地网关。
- 45 技能目录（tools/list）来自启动器注入的清单——npm 形态下 `presets/` 随包分发，bin 自动装配。

---

**回链**：M41 计量持久化 · E0 本地网关 · 演进集 v1.2.0 观察窗判据
