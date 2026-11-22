# YYC³ · npm 双包发布记录（首次 · 2026-11-02）

> **发布人**：yyccube（npm org `yyc3` owner）· **令牌**：classic（env 直传零落盘 · **已建议撤销轮转**）· **依据**：《可复用性分析》§六四步手册 + 解冻令 v1.2.0 豁免项（M32 预检 + W0 安审双门全过）

## 发布物

| 包 | 版本 | tarball | dist-tag |
| --- | --- | --- | --- |
| **@yyc3/ai-family-kernel** | 2.52.0 | `yyc3-ai-family-kernel-2.52.0.tgz` | latest |
| **@yyc3/ai-family-agent** | 2.52.0 | `yyc3-ai-family-agent-2.52.0.tgz` | latest |

- kernel：内核库（116 源 + 31 vendor · exports 8 子路径 · JS+d.ts 预编译 · 零运行时依赖）
- agent：MCP Server（bin `yyc3-family-server` · 155 产物 · presets/assets 入包 · 零运行时依赖）

## digest 公示（R3 · SHA256SUMS）

```
bafa6653a5fd…  ai-family-kernel/yyc3-ai-family-kernel-2.52.0.tgz
bd16ea6cfdfb…  ai-family-agent/yyc3-ai-family-agent-2.52.0.tgz
14cdb08b46be…  ai-family-agent/assets/packs/family-core-1.0.0.skill
```

> 全量 SHA256 以仓内 `dist/SHA256SUMS.txt` 为准（`pnpm pack:npm` 确定性重算）；验证：`shasum -a 256 <tarball>` 比对。

## 后续版本

| 包 | 版本 | 内容 | 发布日 |
| --- | --- | --- | --- |
| 双包 | **2.58.0**（当前 latest） | **H7 /metrics 端口占用降级不崩**（旧实例未退/多开占端口时照常服务——ZCode CONNECTION_CLOSED 治本） | 2026-11-23 |
| 双包 | 2.57.0 | H6 协议协商修复（initialize 原样回显 client 请求版本——ZCode 协议断裂治本） | 2026-11-21 |
| 双包 | 2.56.0 | P1 封装深化全量：B3 成员技能组 + B4 插件装配 + A3 HTTP 常驻 + C1 脚手架 + C2 内核样板 | 2026-11-16 |
| 双包 | 2.55.0 | **H5 握手死锁治本** + 外部编排降级兜底 + P0-A2 一键接入脚本 | 2026-11-16 |
| 双包 | 2.54.0 | M41 计量持久化 + M41.5 serveMcpStdio host 接入形态 | 2026-11-11 |
| 双包 | 2.52.0 | 首发（M31 装配） | 2026-11-02 |

**token 轮转已完成**（2026-11-11 确认：classic 已换新并实测可用——旧双暴露 token 作废）；发布走本地鉴权（zsh 源劫持正常）。

### 2.56.0 发布回执（2026-11-16 · A4 金包公示例行化）

- **内容**：B3 成员技能组（8 员视图 · 已装 `~/.zcode/skills/`）· B4 插件装配（`dist/yyc3-family-plugin`）· A3 `serveMcpHttp`（`YYC3_HTTP_PORT` 启用）· C1 模板脚手架 · C2 内核样板——P1 全量闭环，门禁 **388/388**。
- **digest 公示（R3 · SHA256SUMS 例行）**：
  ```
  f645bdb5d2c9…  ai-family-kernel/yyc3-ai-family-kernel-2.56.0.tgz
  76754cd58598…  ai-family-agent/yyc3-ai-family-agent-2.56.0.tgz
  14cdb08b46be…  ai-family-agent/assets/packs/family-core-1.0.0.skill   ← 金包（自 2.52.0 起恒值，零漂移锚定）
  ```
- **金包公示例行化（A4）**：每版回执随附金包 digest 行——金包内容不变则 digest 恒值（上三版一致 `14cdb08b46be…`），变更即漂移可审计。

## 安装验证

```bash
npm install @yyc3/ai-family-kernel   # 内核库
npx yyc3-family-server --selftest    # MCP Server（stdin 配置 JSON）
```

## 版本策略

双包版本恒与根仓同步（`pack-npm.mjs` 红线断言）；MINOR 递增随 PR 合并，PATCH 预留给 hotfix。

---

**里程碑意义**：R1（内核 npm 包）+ R2（MCP Server）+ R3（digest 公示）三路线随本发布**终局落地**——复用路线 R1–R5 全部闭环。
**回链**：可复用性分析 §六 · CHANGELOG v2.52.0 · 0379-World 总账（解冻令 v1.2.0 豁免项闭环）
