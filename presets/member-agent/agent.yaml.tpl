# ============================================================
# YYC³ AI Family — 家人 Agent 元数据（模板）
# 由 scripts/create-member.sh 生成；占位符 {{...}} 会被替换。
# ============================================================
编号: "010301-{{MEMBER_NUMBER}}"
名号: {{MEMBER_NAME}}
英文名: {{MEMBER_EN_NAME}}
英文角色: {{MEMBER_ROLE_EN}}
角色: {{MEMBER_ROLE}}
层级: {{MEMBER_LAYER}}
层级名称: {{MEMBER_LAYER_NAME}}
所属分组: {{MEMBER_GROUP}}
版本: v1.0.0
状态: online
座右铭: 「{{MEMBER_MOTTO}}」
专属热线: "{{MEMBER_HOTLINE}}"
品牌色: "{{MEMBER_COLOR}}"

权限:
  - intent.read
  - intent.classify
  - context.manage
  - memory.read:working
  - memory.read:semantic
  - memory.read:procedural
  - memory.write:episodic
  - memory.write:procedural

# 五支柱标准增量声明（四者缺一即视为不合规）
支柱:
  self: self-judge
  knowledge: memory-bindings
  learning: procedural
  governance: guardrail
  healing: delegation

provider_chain:
  - openai
  - zhipu
  - ollama
