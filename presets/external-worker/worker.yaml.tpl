# ============================================================
# YYC³ AI Family — 外部 Worker 契约模板（P2-T1）
# ------------------------------------------------------------
# 定位：蓝图 13（Python 族）等外部家人以「外部 worker」身份参与协同的
#       唯一契约入口。主仓不引入其运行时（零依赖红线），只约定：
#       端点 / 能力引用 / 鉴权方式 / 超时 / 降级策略。
# 规则：
#   1. capabilities 只能引用 presets/family-manifest.yaml 的技能 id
#      （如 qianhang.nlq-to-api），不得自造能力名（校验：
#      node scripts/check-external-worker.mjs --file <实例.yaml>）。
#   2. 鉴权令牌一律走环境变量名引用（token_env），契约文件不落值。
#   3. 实例文件命名：presets/external-worker/{worker-id}.worker.yaml
#      （校验脚本按该模式扫描；examples/ 目录不参与校验）。
# 占位符：${VAR} 由部署侧填充；本模板本身可被 --file 校验（结构级）。
# ============================================================

worker:
  # 外部 worker 标识（kebab-case；与家人 slug 命名空间隔离，禁用八家人 slug）
  id: ${WORKER_ID}
  # 服务端点（含 scheme；主服务端口 3030 与 A2A 网关须避开）
  endpoint: ${WORKER_ENDPOINT}
  # 鉴权（scheme ∈ bearer_token | api_key；token 只引用环境变量名）
  auth:
    scheme: ${WORKER_AUTH_SCHEME}
    token_env: ${WORKER_TOKEN_ENV}
  # 单次请求超时（毫秒；A2A 委托层据此设置请求超时）
  timeout_ms: ${WORKER_TIMEOUT_MS}
  # 降级策略：超时/失败时的回退（rule-default = 规则主选；drop = 直接丢弃）
  fallback: ${WORKER_FALLBACK}
  # 能力清单：逐项引用 manifest 技能 id（不得自造；由校验脚本对账）
  capabilities:
    - ${CAPABILITY_1}
  # 对账锚点：capability 对齐的唯一事实源
  capabilitiesRef:
    manifest: presets/family-manifest.yaml
