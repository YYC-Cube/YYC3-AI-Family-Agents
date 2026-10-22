#!/usr/bin/env bash
# ============================================================
# YYC³ AI Family · 落地规划脚本 — 数据迁移（骨架）
# 职责：记忆框架分层迁移（旧存储 → 七层记忆）＋ 双时态索引重建
# 原则：先快照后迁移，RPO=0（架构 §6.2）；失败自动回滚
# ============================================================
set -euo pipefail

SNAPSHOT_DIR=".runtime/memory-snapshots/$(date +%Y%m%d%H%M%S)"
echo "[migrate] 0/4 创建迁移前快照 → $SNAPSHOT_DIR"
mkdir -p "$SNAPSHOT_DIR"
# TODO(infra): pg_dump / redis BGSAVE / 向量库 export 至 $SNAPSHOT_DIR

echo "[migrate] 1/4 迁移短期会话 → working-context"
# TODO(infra): 会话表清洗 + 注意力评分回填

echo "[migrate] 2/4 迁移任务轨迹 → episodic-store（双时态索引）"
# TODO(infra): event_time + recorded_time 双列重建索引

echo "[migrate] 3/4 迁移画像/领域知识 → semantic-graph"
# TODO(infra): 实体解析（entity-resolver）+ 冲突标记（semantic-diff）

echo "[migrate] 4/4 提炼行为规则 → procedural-memory（版本化 YAML）"
# TODO(infra): 从 system-prompt 提取规则 → procedural/*.yaml + git tag

echo "[migrate] 完成（快照保留于 $SNAPSHOT_DIR，确认无误后可清理）"
