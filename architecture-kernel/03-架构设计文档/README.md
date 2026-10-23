# architecture-kernel · 架构设计文档索引

> 权威设计文档统一存放于 `docs/`，本目录仅维护**设计 ↔ 代码映射索引**，不复制内容（防冗余）。

## 设计 ↔ 代码映射

| 设计主题 | 权威文档（docs/） | 代码落位（architecture-kernel/） |
| --- | --- | --- |
| 九层规划设计 / 架构设计 | `YYC3-AI-Family-Agent-协同架构/01、04` | `01-九层架构分层底座/`（L1–L9 能力底座） |
| 九层云枢系统 | `YYC3-AI-Family-Agent-协同架构/02` | `02-云枢核心引擎/`（编排器/总线/状态中心/电话/自愈） |
| 九层家人档案系列 | `YYC3-AI-Family-Agent-协同架构/03` | `family-agents/`（顶层目录） |
| 九层落地规划 | `YYC3-AI-Family-Agent-协同架构/05` | `04-落地规划脚本/` ＋ 根 `scripts/` |
| 五维五高五标五化 | `YYC3-AI-Family-Agent-人机协同/01` | 五支柱引擎 05/06/07 ＋ `shared-core/` |
| 情感文化总铭 | `YYC3-AI-Family-Agent-人机协同/02` | 各家人 `emotion/`（emotion-kit） |
| 家人档案（8 位） | `YYC3-AI-Family-Agent-家人档案/` | `family-agents/{business,core}-layer/member-*/` |
| 架构总纲（五支柱融合 v2.1.0） | `YYC3-AI-Family-Agent-架构设计.md` | 全内核 |

## 维护约定

1. 设计变更先改 `docs/` 权威文档，再同步代码与本文索引（文档先行）。
2. 本索引表新增行时，必须在《架构设计.md》§8.3 变更记录留痕。
3. 已失效/并入的设计讨论归档至 `docs/_archive/`，不在本目录留存副本。
