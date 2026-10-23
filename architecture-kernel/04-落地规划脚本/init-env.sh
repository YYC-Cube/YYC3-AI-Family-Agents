#!/usr/bin/env bash
# ============================================================
# YYC³ AI Family · 落地规划脚本 — 环境初始化（骨架）
# 职责：校验依赖 → 生成 .env → 初始化目录与配置
# 对应《架构设计.md》§4「04-落地规划脚本」/ §6 非功能性需求
# ============================================================
set -euo pipefail

echo "[init-env] 1/4 校验运行时依赖（node>=20 / pnpm / docker）"
for cmd in node pnpm docker; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "缺少依赖: $cmd" >&2; exit 1; }
done

echo "[init-env] 2/4 生成 .env（若不存在）"
if [ ! -f .env ]; then
  cat > .env <<'EOF'
# YYC3-AI-Family-Agent 环境变量模板（真实值勿提交）
LLM_PROVIDER_OPENAI_API_KEY=
LLM_PROVIDER_ZHIPU_API_KEY=
LLM_FALLBACK_OLLAMA_BASE_URL=http://localhost:11434
MEMORY_VECTOR_STORE_URL=
BUS_REDIS_URL=
EOF
  echo "  已生成 .env（请填入真实值）"
else
  echo "  .env 已存在，跳过"
fi

echo "[init-env] 3/4 初始化运行时目录"
mkdir -p .runtime/{bus-dlq,memory-snapshots,learning-queue}

echo "[init-env] 4/4 类型与脚本自检"
pnpm -v >/dev/null
# TODO(infra): tsc --noEmit && docker compose config 校验
echo "[init-env] 完成"
