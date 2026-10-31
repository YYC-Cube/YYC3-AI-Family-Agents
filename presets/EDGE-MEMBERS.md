# YYC³ · E2a 裂变试点登记（EDGE-MEMBERS）

> **管线**：`node scripts/create-member.mjs scaffold --card <角色卡.json>`（四闸全绿才产出：角色卡结构 / 人格红线 / 技能查重 / 零漂移 · 计时 ≤600s 门禁）
> **红线**：8 人格定数不可稀释（命中家族名号/职务即拒）；边缘成员只携带独有技能（查重 vs 家族 manifest 45 条 + skills/ 产物）；模型档位 `${LLM_STEP_TIER:-flagship}` env 占位。

## 试点在册（2026-10-31 · 2 例）

| 成员 | 分组 | 挂靠支柱 | 独有技能 | 角色卡 | 管线耗时 |
| --- | --- | --- | --- | --- | --- |
| 就绪·域包执行员（member-edge-executor） | business-layer L5 | 治 | edge.domain-execute · edge.pack-inventory | `presets/profiles/edge-cards/member-edge-executor.json` | **0.0s**（≪600s 门禁） |
| 巡常·技能巡检员（member-skill-patroller） | core-layer L7 | 学 | edge.skill-patrol · edge.drift-report | `presets/profiles/edge-cards/member-skill-patroller.json` | **0.0s**（≪600s 门禁） |

## 产物结构（管线产出 · 成员自含）

```
family-agents/<layer>/member-xxx/
  ├─ （模板全量：core/emotion/nlq/prompts/providers/self-judge/tests/agent.yaml）
  ├─ member-manifest.yaml   # 成员清单（CO-STAR 五要素 + pillar 挂靠 + 独有技能）——不入家族主 manifest
  ├─ agent-card.json        # 自含 A2A 卡（最小形态）
  └─ system-prompt.md       # 模板 + CO-STAR 定制段（管线追加）
```

## 门禁覆盖

- **管线内四闸**（产出即全绿）：角色卡结构校验 · 人格红线 · 技能查重 · 模板零漂移自证
- **仓内门禁**：`fission-pipeline.contract`（F1 冒充拒 · F2 重复技能拒 · F3 端到端 · F4 试点在册）+ `member:check` 零漂移（9 成员含试点 · 定制三件白名单）+ `prompt.contract` 边缘豁免（非家族 16 契约面）

## 新增边缘成员流程

1. 写角色卡 JSON（CO-STAR 五要素 + pillar + 独有技能清单）→ `presets/profiles/edge-cards/`
2. `node scripts/create-member.mjs scaffold --card presets/profiles/edge-cards/<卡>.json`
3. 入册：`create-member.mjs` DRIFT_WHITELIST 增成员限定三条 + `check-prompts.mjs` EDGE_MEMBERS 增名 → `pnpm member:check` 全绿 → PR
