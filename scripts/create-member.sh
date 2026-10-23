#!/usr/bin/env bash
# ============================================================
# YYC³ AI Family — 新家人一键创建脚本（create-member.sh）
# 依据：YYC3-AI-Family-Agent-架构设计.md §4.1 / §4（family-agents）
# 作用：把 presets/member-agent/ 模板复制为目标家人目录，
#       去除 .tpl 后缀并替换占位符。
#
# 用法：
#   bash scripts/create-member.sh \
#     --id member-x --name <言启·XX> --en-name <EnName> \
#     --role <角色> --layer <L2..L9> --number <NN> \
#     [--group business-layer|core-layer] [--hotline <号>] \
#     [--color <#hex>] [--motto <座右铭>]
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PRESET_DIR="${ROOT_DIR}/presets/member-agent"
MEMBERS_DIR="${ROOT_DIR}/family-agents"

usage() {
  cat >&2 <<'USAGE'
用法:
  bash scripts/create-member.sh --id member-x --name <中文名号> --en-name <英文名> \
    --role <角色> --layer <L2..L9> --number <NN> \
    [--group business-layer|core-layer] [--hotline <号>] [--color <#hex>] [--motto <座右铭>]

示例:
  bash scripts/create-member.sh --id member-qianhang --name 言启·千行 \
    --en-name QianHang --role "首席导航员 · 意图之门" --layer L5 --number 01 \
    --hotline 0379-0106 --color "#0088cc"
USAGE
}

# --- 默认值 ---
MEMBER_ID=""
MEMBER_NAME=""
MEMBER_EN_NAME=""
MEMBER_ROLE=""
MEMBER_LAYER=""
MEMBER_NUMBER=""
MEMBER_GROUP="business-layer"
MEMBER_HOTLINE="0379-0000"
MEMBER_COLOR="#0088cc"
MEMBER_MOTTO="待补全——以诚相待，不负所托"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --id)       MEMBER_ID="${2:-}"; shift 2 ;;
    --name)     MEMBER_NAME="${2:-}"; shift 2 ;;
    --en-name)  MEMBER_EN_NAME="${2:-}"; shift 2 ;;
    --role)     MEMBER_ROLE="${2:-}"; shift 2 ;;
    --layer)    MEMBER_LAYER="${2:-}"; shift 2 ;;
    --number)   MEMBER_NUMBER="${2:-}"; shift 2 ;;
    --group)    MEMBER_GROUP="${2:-}"; shift 2 ;;
    --hotline)  MEMBER_HOTLINE="${2:-}"; shift 2 ;;
    --color)    MEMBER_COLOR="${2:-}"; shift 2 ;;
    --motto)    MEMBER_MOTTO="${2:-}"; shift 2 ;;
    -h|--help)  usage; exit 0 ;;
    *) echo "错误：未知参数 '$1'" >&2; usage; exit 1 ;;
  esac
done

# --- 必填校验 ---
require() {
  local flag="$1" value="$2"
  if [[ -z "${value}" ]]; then
    echo "错误：缺少必填参数 ${flag}" >&2
    usage
    exit 1
  fi
}
require --id       "${MEMBER_ID}"
require --name     "${MEMBER_NAME}"
require --en-name  "${MEMBER_EN_NAME}"
require --role     "${MEMBER_ROLE}"
require --layer    "${MEMBER_LAYER}"
require --number   "${MEMBER_NUMBER}"

# --- 取值校验 ---
if [[ "${MEMBER_ID}" != member-* ]]; then
  echo "错误：--id 必须以 'member-' 开头，当前为 '${MEMBER_ID}'" >&2
  exit 1
fi

case "${MEMBER_LAYER}" in
  L2|L3|L4|L5|L6|L7|L8|L9) ;;
  *) echo "错误：--layer 必须为 L2..L9，当前为 '${MEMBER_LAYER}'" >&2; exit 1 ;;
esac

case "${MEMBER_GROUP}" in
  business-layer|core-layer) ;;
  *) echo "错误：--group 必须为 business-layer 或 core-layer，当前为 '${MEMBER_GROUP}'" >&2; exit 1 ;;
esac

if [[ ! "${MEMBER_NUMBER}" =~ ^[0-9]{2}$ ]]; then
  echo "错误：--number 必须为两位数字（如 01），当前为 '${MEMBER_NUMBER}'" >&2
  exit 1
fi

TARGET="${MEMBERS_DIR}/${MEMBER_GROUP}/${MEMBER_ID}"
if [[ -e "${TARGET}" ]]; then
  echo "错误：目标已存在，禁止覆盖 —— ${TARGET}" >&2
  exit 1
fi

if [[ ! -d "${PRESET_DIR}" ]]; then
  echo "错误：找不到模板目录 —— ${PRESET_DIR}" >&2
  exit 1
fi

# --- 派生占位符值 ---
case "${MEMBER_LAYER}" in
  L2) MEMBER_LAYER_NAME="千里伯乐" ;;
  L3) MEMBER_LAYER_NAME="预见先知" ;;
  L4) MEMBER_LAYER_NAME="语枢万物" ;;
  L5) MEMBER_LAYER_NAME="言启千行" ;;
  L6) MEMBER_LAYER_NAME="创想灵韵" ;;
  L7) MEMBER_LAYER_NAME="格物致知" ;;
  L8) MEMBER_LAYER_NAME="智云守护" ;;
  L9) MEMBER_LAYER_NAME="万象归元" ;;
esac
# 英文角色：取 --role 中 ' · ' 之后的英文部分（缺省回退为 EnName）
MEMBER_ROLE_EN="${MEMBER_EN_NAME}"

# --- 复制模板（排除预设说明 README.md）---
mkdir -p "${TARGET}"
cp -R "${PRESET_DIR}/." "${TARGET}/"
rm -f "${TARGET}/README.md"
# 清理 macOS Finder 元数据，避免污染生成目录
find "${TARGET}" -name '.DS_Store' -delete 2>/dev/null || true

# --- 去除 .tpl + 替换占位符 ---
subst_file() {
  local file="$1"
  local out="${file%.tpl}"
  local tmp
  tmp="$(mktemp)"
  sed \
    -e "s|{{MEMBER_ID}}|${MEMBER_ID}|g" \
    -e "s|{{MEMBER_NUMBER}}|${MEMBER_NUMBER}|g" \
    -e "s|{{MEMBER_NAME}}|${MEMBER_NAME}|g" \
    -e "s|{{MEMBER_EN_NAME}}|${MEMBER_EN_NAME}|g" \
    -e "s|{{MEMBER_ROLE_EN}}|${MEMBER_ROLE_EN}|g" \
    -e "s|{{MEMBER_ROLE}}|${MEMBER_ROLE}|g" \
    -e "s|{{MEMBER_LAYER_NAME}}|${MEMBER_LAYER_NAME}|g" \
    -e "s|{{MEMBER_LAYER}}|${MEMBER_LAYER}|g" \
    -e "s|{{MEMBER_GROUP}}|${MEMBER_GROUP}|g" \
    -e "s|{{MEMBER_MOTTO}}|${MEMBER_MOTTO}|g" \
    -e "s|{{MEMBER_HOTLINE}}|${MEMBER_HOTLINE}|g" \
    -e "s|{{MEMBER_COLOR}}|${MEMBER_COLOR}|g" \
    "${file}" > "${tmp}"
  mv "${tmp}" "${out}"
  if [[ "${out}" != "${file}" ]]; then
    rm -f "${file}"
  fi
}

while IFS= read -r -d '' f; do
  subst_file "${f}"
done < <(find "${TARGET}" -type f -name '*.tpl' -print0)

echo "✅ 已创建家人：${MEMBER_NAME}（${MEMBER_ID}）"
echo "   编号：010301-${MEMBER_NUMBER}   层级：${MEMBER_LAYER} ${MEMBER_LAYER_NAME}   分组：${MEMBER_GROUP}"
echo "   路径：${TARGET}"
echo ""
echo "下一步："
echo "  1. 编辑 agent.yaml 补全座右铭/权限"
echo "  2. 编辑 system-prompt.md 补全核心职责与家族誓言"
echo "  3. 编辑 procedural/intent-rules.yaml 定义意图解析规则（可版本化）"
echo "  4. 编辑 memory-bindings/memory-binding.yaml 调整记忆预算与精度"
echo "  5. 补齐 core/*.service.ts 与 providers/*.provider.ts 的 TODO(infra)"
echo "  6. 运行 pnpm typecheck 校验；pnpm test 运行单测"
