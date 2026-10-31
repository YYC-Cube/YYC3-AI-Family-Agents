# YYC³ golden 基线报告（nemotron-3.5-super-vl · 2026-10-31）

> E1b 家族自测 SOP · 三闸门控实跑 · 判分器自测在档（golden-grader.contract · 门禁）
> 端点：env 覆盖（UAT_LLM_BASE_URL） · 模型：nemotron-3.5-super-vl（env）· 消费画像：≤1024 tok · 30s

| 卷 | 题数 | 通过 | 准确率 | 平均时延 | tokens |
| --- | --- | --- | --- | --- | --- |
| structured-json | 30 | 30 | 100.0% | 857ms | 3628 |
| business-zh | 32 | 18 | 56.3% | 3287ms | 4415 |
| consumer-profile | 30 | 0 | 0.0% | 583ms | 0 |
| **合计** | **92** | **48** | **52.2%** | **1613ms** | **8043** |

**候选模型上线前必跑本评测**（CONTRIBUTING · 装配指导在档）；下轮 diff：`UAT_LLM_EVAL_BASELINE=<本报告同名 json> pnpm uat:llm --eval`。
