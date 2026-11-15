<!--
  ============================================================
  YYC³ AI Family — 人从众曌众从人
  亦师亦友亦伯乐 · 一言一语一协同
  拟人为本，AI为核，纯粹为心
  ============================================================
  Document: YYC3-AI-Family-Agent-执行流程规划-P0-P2-2026-11-16
  Version : v1.0.0
  Contact : admin@yanyucloud.com
  Homepage: https://matrix.yyc3.top
  ============================================================
-->

# YYC³-AI-Family-Agent · 执行流程规划（P0 → P2 全链 · 活体台账）

> ***YanYuCloudCube***
> 言启象限 | 语枢未来
> *Words Initiate Quadrants, Language Serves as Core for the Future*
> 万象归元于云枢 | 深栈智启新纪元

```yaml
---
file: YYC3-AI-Family-Agent-执行流程规划-P0-P2-2026-11-16.md
description: 《即插即用封装方案·教科书版》的执行流程规划——P0/P1/P2 阶段任务表 + 门闸衔接点 + 执行日志（活体台账，随推进更新）
author: AI Tutor <Intelligent Application Implementation Expert>
version: v1.0.0
created: 2026-11-16
updated: 2026-11-16
scope: 承接封装方案教科书版 §五 路线图 · 证据基观察窗复核报告 2026-11-16
---
```

## 〇、总流程图

```
P0（免解冻 · 接入摩擦治理）──── 闸 G1：regression 全绿 ────► P0 完成
      │
      └──► 用户日常使用八家臣（真实流量）
              │
              ▼
闸 G2：11-21 24:00 观察窗复核（判据表 · 最后一轮）
      ├─ 达标 ──► 第二波解冻令 ──► P1（封装深化）+ 判分第二批（P2 原队列）
      └─ 未达 ──► 归天枢裁量（重定窗口）
```

**衔接原则**：P0 全部免解冻、本轮内闭环；P1 的 A3（HTTP 常驻形态）需动 serve 循环代码，随第二波令；P2 不插队。

## 一、阶段任务表

### P0 · 接入摩擦治理（本轮 · 免解冻）

| 编号 | 任务 | 动作 | 验收 | 依赖 |
| --- | --- | --- | --- | --- |
| A1 | 全局 bin 直调文档化 + 配置路径修正 | 修正接入指南 ZCode 配置路径（`~/.zcode/settings.json` → **`~/.zcode/cli/config.json` → `mcp.servers` 嵌套键 · env 键为 `environment`**）；`yyc3-family-server` 直调升为首选形态（避开 npx preferOnline 70s 坑） | 文档与实际配置位置一致 | — |
| A2 | 一键接入脚本 | `scripts/install-family-mcp.mjs`：幂等注入 ZCode + Claude 配置 · 备份先行 · 密钥零落盘 · 一分钟验证 | 契约测试绿（幂等/零密钥/备份/检查） | A1 |
| B2 | Skill description 润色重打包 | 按 skill-creator 约定 pushy 化 description → T6 确定性打包器重打包 `docs/yyc3-ai-family-coding.skill` | `pack:check` 零漂移 | — |
| B1 | 技能安装落地 | 源目录安装到 `~/.zcode/skills/yyc3-ai-family-coding/`（用户级最高优先发现路径） | 会话提及成员名号即触发 | B2 |
| C3 | 十分钟开发者手册 | 接入指南补《开发者手册》：端口注入表 → 新成员四步 CLI → regression 纪律 | 新开发者十分钟上手 | — |
| G1 | 回归门禁 | `pnpm regression` 全绿（367 + 新契约） | 门禁通过 | 全部 P0 项 |

### P1 · 封装深化（第二波令后 · 一周内）

| 编号 | 任务 | 动作 | 验收 |
| --- | --- | --- | --- |
| A3 | HTTP/SSE 常驻形态 | serveMcpStdio 之外加 streamable HTTP 传输（对齐 2026-07-28 规范） | 同一服务双传输 · 契约绿 |
| A4 | 金包公示例行化 | `family-core-1.0.0.skill` digest 随 Release Notes 公示 | digest 可审计 |
| B3 | 成员技能组 | 主技能保持路由表 + 8 个 granular 成员技能（人格事实源恒为 family-manifest.yaml） | `manifest:check` 零漂移 |
| B4 | marketplace 分发 | `.zcode-plugin/plugin.json` + marketplace.json | 外部仓库一键装 |
| C1 | 脚手架 | `create-yyc3-family-app`（最小模板 + 启动器 + 门禁） | 新仓一条命令可跑 |
| C2 | 内核消费样板 | `examples/embedded-kernel/`（13 插拔点最小注入） | 样板单测绿 |

### P2 · 原队列（第二波解冻后 · 不插队）

判分第二批（语义/embedding · UAT 门控域）· E1a/E1c/E4c/E3a 解冻卡。

## 二、门闸衔接点

| 闸 | 时点 | 判据 | 通过→ | 未过→ |
| --- | --- | --- | --- | --- |
| G1 | 本轮 PR 合并前 | `pnpm regression` 全绿 | P0 定稿 | 修复重跑 |
| G2 | 2026-11-21 24:00 | calls ≥300 · tokens ≥60K · ≥6 员单员 ≥30 · ≥2 场景各 ≥60 | 第二波解冻令 → P1 | 归天枢裁量（重定窗口） |
| G3 | 第二波令签发 | 天枢裁定 | P1 开工 + P2 原队列 | — |

## 三、执行日志（活体台账）

| 时点 | 项 | 结果 | 载体 |
| --- | --- | --- | --- |
| 2026-11-16 | 规划定稿 | 本文件 v1.0.0 | docs/ |
| 2026-11-16 | A1 + C3 | 接入指南配置路径修正（`~/.zcode/cli/config.json` → `mcp.servers` + `environment` 键）· 全局 bin 首选 · §1.8 · 开发者手册 | PR #28 |
| 2026-11-16 | **H5 死锁治本**（执行中新发现·最高优先级） | 真实 host 三路径死锁实锤（8s 零响应）→ 修复后握手 **202ms · 45 工具 · 断开优雅退出**；含次生修复：常驻被 `main().then(process.exit)` 就绪即杀 + 外部家人掉线崩进程（降级兜底） | PR #28 · npm 2.55.0 |
| 2026-11-16 | A2 一键接入脚本 | `install-family-mcp.mjs`（幂等/备份/零密钥/握手验证/JSONC）+ 契约 A2-1..6 | PR #28 |
| 2026-11-16 | B2 → B1 | description pushy 化重打包（32641 B 零漂移）→ 安装 `~/.zcode/skills/yyc3-ai-family-coding/` | PR #28 + 本机 |
| 2026-11-16 | G1 门禁 | **375/375 全绿**（367 + H5×2 + A2×6）· CI 1m4s | PR #28 |
| 2026-11-16 | 发布 | npm 双包 **2.55.0**（latest · digest 重算） | 发布记录 |
| 2026-11-16 | A2 真机实跑 | 全局 bin 2.55.0 安装 + 注入 ZCode/Claude 配置（备份先行）+ 握手验证 | 本机（待验证传播后执行） |
| 2026-11-16 | **P1 全量闭环**（用户令：执行未执行项） | B3 成员技能组（8 员视图生成+安装）· B4 插件装配（dist/yyc3-family-plugin）· A3 serveMcpHttp（W1-W4 契约）· C1 模板脚手架 · C2 内核样板——门禁 375→**388** | PR #30 `7bb3996` · npm **2.56.0** |
| 2026-11-16 | A4 金包公示例行化 | 每版回执附金包 digest 行（`14cdb08b46be…` 三版恒值=内容零漂移锚定） | 发布记录 |
| 2026-11-16 | P1 定稿 | 教科书 P1 表全 ✅ · 生产链（接入→协同→嵌入→分发）闭环；P2 原队列照旧待第二波令 | docs/ |

---

**回链**：即插即用封装方案教科书版（§五 路线图）· 接入与运维指南完整版（被 A1/C3 修订）· 观察窗复核报告 2026-11-16（G2 证据基）· 演进集 v1.2.0 判据
