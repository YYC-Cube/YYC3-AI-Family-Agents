# 贡献指南（CONTRIBUTING）

> ***YanYuCloudCube*** · *言启象限 | 语枢未来*
> 感谢你为 YYC³ AI Family Agent 贡献力量！请先阅读 [行为准则](CODE_OF_CONDUCT.md)；安全相关问题请按 [安全政策](SECURITY.md) 私下报告。

**相关文档**：[架构设计](docs/YYC3-AI-Family-Agent-架构设计.md) · [变更日志](CHANGELOG.md) · [安全政策](SECURITY.md) · [L7/L8 计划](docs/YYC3-AI-Family-Agent-L7-L8落地计划.md)

---

## 🚀 快速开始

### 环境准备

```bash
git clone git@github.com:YYC-Cube/YYC3-Family-AI-Agents.git
cd YYC3-Family-AI-Agents

# Node ≥ 20；tsc 可用（局部或全局）
node -v
tsc -v

# 门禁（无需安装任何运行时依赖）
pnpm regression      # 或：node scripts/run-regression.mjs
```

> 本仓库**零运行时依赖**：`pnpm install` 仅在你需要本地 IDE 类型提示或额外工具时执行。

### 常用命令

| 命令 | 作用 |
| ---- | ---- |
| `pnpm typecheck` | `tsc --noEmit`（严格模式） |
| `pnpm regression` | 隔离编译 → 13 套件 → 五支柱聚合 → 面板 → 门禁退出码 |
| `pnpm regression -- --dashboard-only` | 只刷新面板，不因失败返回非零 |
| `YYC3_KEEP_TMP=1 pnpm regression` | 保留临时编译目录（调试用） |

---

## 📁 仓库结构约定

| 路径 | 用途 | 变更约束 |
| ---- | ---- | -------- |
| `02-智能协同架构内核/` | 五支柱内核（编号顺延，新增模块顺延编号） | 不得跨层反向依赖；`05` 不得 import `07` |
| `03-家人Agent实现集/` | 8 位家人与 `shared-core` | 名称变更需跨层同步（README / docs / presets） |
| `08-系统装配/` | 唯一同时知道 `05` 与 `07` 的模块 | 装配顺序不可调换 |
| `09-可观测性/` | 指标注册、埋点、端点 | 新增指标需登记 help/type 并接入告警或面板 |
| `ops/` | 告警规则、抓取配置、面板、部署 | 规则/抓取变更需 YAML 解析验证 |
| `tests/` | 单元 / 集成 / e2e / 契约 | 新能力必须有可执行用例；禁止空断言占位 |
| `docs/` | 架构、验收、指导、计划 | 遵循 YYC³ 文档规范（Front Matter + 品牌标头） |
| `public/` | 品牌素材与多平台图标 | 需与品牌规范一致；不要改目录拼写 |

### 文档规范

- YAML Front Matter 必填：`file` / `description` / `version` / `created` / `status`
- 术语以家人注册表为准（如「千里·伯乐」）
- 引用代码使用可点击链接；敏感信息使用 `${ENV_VAR}` 或 `[REDACTED]`
- 版本变更同步写入 [CHANGELOG.md](CHANGELOG.md) 与架构设计 `§8.3`

---

## 🔄 开发工作流（PDCA+）

1. **Plan**：明确目标与验收标准；结构性变更先在 `docs/` 立项
2. **Do**：小步提交，一个 commit 聚焦一件事
3. **Check**：跑通质量门禁
4. **Act**：不通过则修复；通过则更新执行记录
5. **Archive**：总结变更并留下衔接上下文

### 提交信息（Conventional Commits）

```text
<type>(<scope>): <subject>

[body: 为什么改，而非改了什么]
```

- type：`feat` / `fix` / `docs` / `refactor` / `test` / `chore` / `perf` / `ci`
- scope：`kernel` / `members` / `observability` / `assembly` / `ops` / `docs` / `tests` / `ci`

示例：`feat(observability): 接入 exemplar 下钻（L7 方案 A）`

---

## 🌿 分支与 PR

| 类型 | 格式 | 示例 |
| ---- | ---- | ---- |
| 功能 | `feat/<scope>-<简述>` | `feat/observability-exemplars` |
| 修复 | `fix/<scope>-<简述>` | `fix/assembly-circuit-init` |
| 文档 | `docs/<简述>` | `docs/l7-l8-plan` |

- `main` 受保护：禁止直接 push，一律 PR
- 一个 PR 聚焦一个主题；避免混入无关格式化改动
- 合并方式：Squash Merge（保持线性历史）

### PR 自检清单

- [ ] 动机与影响面写清楚（Why > What）
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm regression` 全绿（新增用例计入总数）
- [ ] 无「空断言」或「恒真断言」；未实现能力必须显式跳过并写明原因
- [ ] 指标/告警/面板变更已同步 `ops/`
- [ ] **未接线模块清单已同步**：新增骨架需登记，完成接线需移除（[清单](docs/YYC3-AI-Family-Agent-未接线模块清单.md)）
- [ ] 文档相对链接可达，无死链
- [ ] 无密钥、Token、真实生产数据

---

## 🔐 安全相关变更

以下变更必须额外评审，并在 PR 描述标注 `[security]`：

- `/metrics` 鉴权、监听地址、令牌处理
- 技能落盘目录与文件权限（`data/`）
- 审计链哈希逻辑、治理策略
- 装配层依赖方向与回滚委托
- 新增依赖（本仓库原则上零运行时依赖，需说明必要性）

> 漏洞修复请先走私密渠道（见 [SECURITY.md](SECURITY.md)），不要公开开 PR 暴露细节。

---

## ✅ 质量门禁

提交前必须全部通过：

| 检查项 | 命令 | 标准 |
| ---- | ---- | ---- |
| 类型检查 | `tsc --noEmit` | 0 error |
| 全量回归 | `pnpm regression` | 78/78 通过；失败即 exit 1 |
| 显式跳过 | 各 spec 输出 | 跳过必须带原因，禁止静默 |
| 面板 | `ops/observability/pillar-dashboard/` | 五支柱全绿 |
| 敏感信息 | `git status` / 人工审阅 | 无 `.env`、`data/`、密钥 |
| 文档链接 | 相对链接检查 | 无死链 |

---

## 🆘 需要帮助

- 问题反馈：[GitHub Issues](https://github.com/YYC-Cube/YYC3-Family-AI-Agents/issues)
- 联系邮箱：<admin@0379.email>

> 「***YanYuCloudCube***」 · **© 2025-2026 YanYuCloudCube™. All Rights Reserved.**
