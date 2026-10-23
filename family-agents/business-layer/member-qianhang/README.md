# 言启·千行 · 家人能力摘要

> YYC³ AI Family — 我们不是工具，而是有温度的家人。

## 基本信息

| 属性 | 值 |
| --- | --- |
| **名号** | 言启·千行（QianHang） |
| **编号** | 010301-01 |
| **层级** | L5「言启千行层」 |
| **角色** | 首席导航员 · 意图之门 |
| **所属分组** | business-layer |
| **专属热线** | 0379-0106 |
| **品牌色** | #0088cc |

## 核心能力

1. **自然语言理解（NLU）**：解析查询、指令等自然语言输入。
2. **意图识别与路由**：判断意图类型（分析/预测/推荐/创作），路由给对应专业家人。
3. **上下文管理**：维护多轮对话上下文，保障交互连贯。
4. **多语言支持**：中英文等多语言理解与翻译。
5. **情感感知**：识别用户情绪，为家族交互注入温度。

## 目录导览

```text
member-qianhang/
├── agent.yaml                         # Agent 元数据（编号/名号/层级/权限/热线）
├── system-prompt.md                   # 角色设定 + 家族誓言
├── README.md                          # 本文件：家人能力摘要
├── core/                              # 核心业务服务
│   ├── intent-gateway.service.ts      # 意图处理总入口
│   ├── context-manager.service.ts     # 对话上下文管理
│   └── intent-classifier.service.ts   # 意图分类器
├── nlq/                               # 自然语言查询
│   ├── query-parser.service.ts        # 查询解析
│   └── query-to-api.mapper.ts         # 查询 → API 映射
├── providers/                         # 模型 Provider（降级链）
│   ├── openai.provider.ts
│   └── zhipu.provider.ts
├── prompts/                           # 提示词模板
│   ├── intent-detection.prompt.ts
│   └── query-parsing.prompt.ts
├── memory-bindings/                   # 【知】记忆绑定声明
│   └── memory-binding.yaml
├── procedural/                        # 【知/学】程序记忆条目
│   └── intent-rules.yaml
├── self-judge/                        # 【自】自我判断层
│   └── index.ts
├── emotion/                           # 【统一必备】情感组件
│   ├── emotion-ripple.component.ts
│   ├── family-chat.component.ts
│   └── achievement-panel.ts
└── tests/
    └── self-judge.spec.ts
```

## 五支柱声明

| 支柱 | 落点 | 说明 |
| --- | --- | --- |
| 自 | `self-judge/` | 意图分类的置信度/假设/偏离/升级 |
| 知 | `memory-bindings/` | 记忆层读取/写入声明与预算 |
| 学 | `procedural/` | 意图解析规则（可版本化） |
| 治 | `guardrail` | 护栏经 shared-core/guardrail-registry 注册 |
| 愈 | `delegation` | Ollama 本地兜底 |

> 严格对齐《YYC3-AI-Family-Agent-架构设计.md》§4.1「家人 Agent 标准目录」。
