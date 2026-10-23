# member-agent 预设（家人 Agent 标准模板）

本目录是 YYC³ AI Family **新家人代码骨架的规范模板**（canonical template）。
`scripts/create-member.sh` 会把它复制到 `family-agents/<group>/<id>/`，去除 `.tpl`
后缀并替换占位符，从而一键生成与示例家人 `member-qianhang`（言启·千行）同构的目录。

## 目录结构（模板 = 示例家人的标准形状）

```text
presets/member-agent/
├── agent.yaml.tpl                            # 元数据（编号/名号/层级/权限/热线）
├── system-prompt.md.tpl                      # 角色设定 + 家族誓言
│
├── core/
│   ├── intent-gateway.service.ts.tpl         # 意图处理总入口
│   ├── context-manager.service.ts.tpl        # 对话上下文管理
│   └── intent-classifier.service.ts.tpl      # 意图分类器
├── nlq/
│   ├── query-parser.service.ts.tpl           # 自然语言查询解析
│   └── query-to-api.mapper.ts.tpl            # 查询 → API 映射
├── providers/
│   ├── openai.provider.ts.tpl                # OpenAI Provider
│   └── zhipu.provider.ts.tpl                 # 智谱 Provider（降级备选）
├── prompts/
│   ├── intent-detection.prompt.ts.tpl        # 意图检测提示词模板
│   └── query-parsing.prompt.ts.tpl           # 查询解析提示词模板
│
├── memory-bindings/memory-binding.yaml.tpl   # 【知】记忆绑定声明
├── procedural/intent-rules.yaml.tpl          # 【知/学】程序记忆条目（可版本化）
├── self-judge/index.ts.tpl                   # 【自】自我判断层
├── emotion/
│   ├── emotion-ripple.component.ts.tpl       # 海洋蓝波动涟漪
│   ├── family-chat.component.ts.tpl          # 蓝色边框消息样式
│   └── achievement-panel.ts.tpl              # 「心心相印」成就触发
├── tests/self-judge.spec.ts.tpl              # 【自】判断层单测
└── README.md                                 # 本文件（预设契约说明，不复制到目标）
```

## 占位符（Placeholders）

| 占位符 | 来源参数 | 说明 | 示例 |
| --- | --- | --- | --- |
| `{{MEMBER_ID}}` | `--id` | 家人目录名，必须以 `member-` 开头 | `member-qianhang` |
| `{{MEMBER_NUMBER}}` | `--number` | 家族编号后两位（两位数字） | `01` |
| `{{MEMBER_NAME}}` | `--name` | 中文名号 | `言启·千行` |
| `{{MEMBER_EN_NAME}}` | `--en-name` | 英文名 | `QianHang` |
| `{{MEMBER_ROLE}}` | `--role` | 角色 | `首席导航员 · 意图之门` |
| `{{MEMBER_LAYER}}` | `--layer` | 能力分层 L2..L9 | `L5` |
| `{{MEMBER_HOTLINE}}` | `--hotline`（可选） | 专属热线 | `0379-0106` |
| `{{MEMBER_COLOR}}` | `--color`（可选） | 品牌色 | `#0088cc` |
| `{{MEMBER_GROUP}}` | `--group`（可选） | 所属分组 | `business-layer` |
| `{{MEMBER_LAYER_NAME}}` | 由 `--layer` 派生 | 层级中文名 | `言启千行` |
| `{{MEMBER_ROLE_EN}}` | 由 `--role` 派生 | 英文角色 | `Navigator` |
| `{{MEMBER_MOTTO}}` | `--motto`（可选） | 座右铭 | `我聆听万千言语` |

## 使用示例

```bash
bash scripts/create-member.sh \
  --id member-qianhang \
  --name 言启·千行 \
  --en-name QianHang \
  --role 首席导航员 · 意图之门 \
  --layer L5 \
  --number 01 \
  --group business-layer \
  --hotline 0379-0106 \
  --color "#0088cc"
```

生成后请在以下位置补齐内容：`agent.yaml`（座右铭/权限）、`system-prompt.md`
（职责与誓言）、`procedural/intent-rules.yaml`（意图规则）、`memory-bindings/memory-binding.yaml`（记忆预算）。
最后运行 `pnpm typecheck` 校验。

> ⚠️ 五支柱标准增量（`self-judge/`、`memory-bindings/`、`procedural/`）为**必备**，
> 缺一即视为不合规（架构设计 §4.1）。
