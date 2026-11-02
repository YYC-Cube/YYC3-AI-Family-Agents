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
