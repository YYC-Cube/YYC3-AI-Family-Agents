# YYC³ AI Family · 场景画像层使用说明（ProfileRegistry · E4a）

> **版本**：v1.0.0（2026-10-31）· **签发依据**：演进集 v1.2.0 解冻令第一波 · E4a 执行卡
> **模块**：`family-agents/shared-core/profile-registry.ts` · **画像源**：`presets/profiles/domains/*.yaml`（8 份）· **校验**：`pnpm profiles:check`

## 一、三级画像模型（最小够用）

```
业务线（domain） × 用户（user，可选） × 场景（scenario，可选）
    └─ 偏好：tier（模型档位占位）/ output_style / budget_tier / language_style
    └─ prompt_anchors：业务域 Prompt 要点（E1b golden 业务卷题源）
```

- **换档语义**：同一技能在不同画像下自动换 model tier 与输出风格；tier 为**档位名**（`reasoning / flagship / speed`），模型名归部署侧 env（`LLM_STEP_*`），`${LLM_STEP_TIER:-flagship}` 占位——强推理位拍板后回填实际映射。
- **计量分口径**：画像命中的语义执行按 `family_llm_usage_*{scenario="llm-assisted@<profileId>"}` 分桶（E0b 三维计数器直接消费）——入住率报表可按画像维聚合。

## 二、换档演示（E4a 卡验收）

| 画像 | tier | 输出风格 | 计量标签 |
| --- | --- | --- | --- |
| `investor-briefing`（投资人简报 · 语枢·万物） | **reasoning** | 结构化简报 | `llm-assisted@investor-briefing` |
| `intent-routing`（日常运营 · 言启·千行） | **speed** | 对话流 | `llm-assisted@intent-routing` |

实证：门禁 `profile-registry.spec.ts` P5（双档解析 + 服务句柄可查）+ P3（计量分口径渲染）。

## 三、首批画像数据（八家人业务域卡 · 千行基准）

| 域卡 id | owner | 业务域 | tier |
| --- | --- | --- | --- |
| investor-briefing | thinker（语枢·万物） | hotel-investment | reasoning |
| intent-routing | qianhang（言启·千行） | ops-daily | speed |
| talent-matching | bole（千里·伯乐） | talent-recommendation | flagship |
| trend-forecast | prophet（预见·先知） | spend-forecast | reasoning |
| brand-content | grace（创想·灵韵） | brand-marketing | flagship |
| quality-audit | grandmaster（格物·宗师） | quality-gate | reasoning |
| compliance-scan | guardian（智云·守护） | security-compliance | speed |
| ops-decision | tianshu（元启·天枢） | ops-arbitration | reasoning |

每卡 `prompt_anchors` 即该家人业务域的转译要点（千行结构化转译范式基准）——**E1b golden 业务卷直接以此为题源**（两卡交扣点）。

## 四、四库 DomainPack ↔ 预置画像映射（E5a 实体登记）

四库 DomainPack（YANYUCLOUDCUBE 侧已齐备放行，演进集 v1.1.3/v1.1.4）即 ProfileRegistry 的预置画像实体（域包 = 画像 + 技能包 + 知识引用的打包形态）：

| DomainPack（四库） | 映射画像 | 首批落点 |
| --- | --- | --- |
| 营销域包 | `brand-content`（grace） | 品牌投放/内容运营场景 |
| 知识中枢域包 | `quality-audit` + `intent-routing`（grandmaster/qianhang） | 知识问答与质检场景 |
| 短剧域包 | `brand-content` 派生场景位（暂挂 grace） | 内容生产场景 |
| 电商域包（样板） | `talent-matching` 邻域（bole 推荐范式复用） | 商品/商家匹配场景 |

> 映射原则：域包提供技能与知识引用，画像提供档位与风格——二者以 `profileId` 关联；域包加载侧（部署）负责把域包内场景登记为对应画像的 scenario。

## 五、接入方式（部署侧）

```ts
// 1. 域卡 YAML（presets/profiles/domains/）经部署侧 yaml 解析为 ProfileDefinition[]
//    （结构校验：pnpm profiles:check；manifest 同范式，运行时零依赖）
const server = await startFamilyServer({
  ...config,
  profiles,                                    // 2. 注入画像
  profileResolver: (skillId) => profileOf(skillId), // 3. 技能 → 画像映射
});
server.profiles.resolve('investor-briefing'); // → { modelTier: 'reasoning', ... }
```

## 六、红线备忘

- 画像数据**最小够用**，不存敏感个人信息（合规底线）。
- 8 人格定数：域卡 owner 只能是八家人 slug（`profiles:check` 强校验）。
- tier/端点/模型名一律 env 或占位，零字面量；密钥零落盘。

---

**关联**：E4a 执行卡 · 演进集 §六 E4a · E0b 三维计量（`family_llm_usage_*`）· E1b golden 业务卷（题源）
