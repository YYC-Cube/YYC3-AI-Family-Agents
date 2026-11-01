# YYC³ golden 基线报告（nemotron-3.5-super-vl · 2026-11-01）

> E1b 家族自测 SOP · 三闸门控实跑 · 判分器自测在档（golden-grader.contract · CI 门禁）
> 端点：env 覆盖（UAT_LLM_BASE_URL） · 模型：nemotron-3.5-super-vl（env）· 消费画像：≤1024 tok · 30s

| 卷 | 题数 | 通过 | 准确率 | 平均时延 | tokens |
| --- | --- | --- | --- | --- | --- |
| structured-json | 30 | 30 | 100.0%（基线 100.0% → 差 0.0pp） | 637ms | 3624 |
| business-zh | 32 | 31 | 96.9%（基线 56.3% → 差 40.6pp） | 6614ms | 10000 |
| consumer-profile | 30 | 30 | 100.0%（基线 0.0% → 差 100.0pp） | 476ms | 3327 |
| **合计** | **92** | **91** | **98.9%** | **2663ms** | **16951** |

**候选模型上线前必跑本评测**（CONTRIBUTING · 装配指导在档）；下轮 diff：`UAT_LLM_EVAL_BASELINE=<本报告同名 json> pnpm uat:llm --eval`。
