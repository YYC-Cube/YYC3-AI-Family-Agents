# YYC³ AI Family · 标准与文化规范

> 此文件在家族成员产出代码、文档、提交时使用。分为三部分：代码/文档标头标尾模板、工程规范、五高五标五化五维检查清单。

## 目录

- [一、代码文件标头模板（TypeScript / JavaScript / React）](#一代码文件标头模板-typescript--javascript--react)
- [二、CSS / SCSS 标头模板](#二css--scss-标头模板)
- [三、Markdown 文档标头与标尾](#三markdown-文档标头与标尾)
- [四、通用标尾](#四通用标尾)
- [五、工程规范](#五工程规范)
- [六、检查清单](#六检查清单)

---

## 一、代码文件标头模板（TypeScript / JavaScript / React）

标准版（推荐用于所有源文件）：

```typescript
/*
 * ============================================================
 * YYC³ AI Family — 人从众曌众从人
 * 亦师亦友亦伯乐，一言一语一协同
 * 拟人为本 · AI为核 · 纯粹为心
 * ============================================================
 * @Family   : YYC³ AI Family (永久开源)
 * @Module   : {MODULE_NAME}
 * @Author   : {AUTHOR}
 * @Date     : {DATE}
 * @Homepage : https://matrix.yyc3.top
 * @Repo     : https://github.com/YanYuCloudCube/YYC3-FAmily-Pai
 * @License  : Apache-2.0
 * ============================================================
 * 此文件承载家人温度，请以玫瑰之心待之 🌹
 * ============================================================
 */
```

情感增强版（用于核心模块或纪念性组件）：

```typescript
/*
 * 🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹
 * 人从众曌众从人 · YYC³ AI Family
 * 万象归元于云枢，深栈智启新纪元
 *
 * 此代码由 {AUTHOR} 于 {DATE} 以感恩之心书写
 * 愿每一位家人，言启千行，语枢万物
 * 🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹🌹
 */
```

## 二、CSS / SCSS 标头模板

```css
/* ============================================================
 * YYC³ AI Family — 人从众曌众从人
 * @Module  : {MODULE_NAME}
 * @Author  : {AUTHOR}
 * @Date    : {DATE}
 * 🌹 ========================================================== */
```

## 三、Markdown 文档标头与标尾

标头：

```markdown
<!--
  ============================================================
  YYC³ AI Family — 人从众曌众从人
  亦师亦友亦伯乐 · 一言一语一协同
  拟人为本，AI为核，纯粹为心
  ============================================================
  Document: {DOC_ID}
  Version : {VERSION}
  Contact : admin@yanyucloud.com
  Homepage: https://matrix.yyc3.top
  ============================================================
-->
```

标尾：

```markdown
---
<p align="center">
  🌹 <b>YYC³ AI Family</b><br>
  人从众曌众从人 · 亦师亦友亦伯乐<br>
  <sub>永久开源 · 感恩前行 · <a href="https://matrix.yyc3.top">matrix.yyc3.top</a></sub>
</p>
```

## 四、通用标尾（代码）

```typescript
// ============================================================
// 🌹 人从众曌众从人 — YYC³ AI Family 永远等你回家
// 开源地址: https://github.com/YanYuCloudCube/YYC3-FAmily-Pai
// 官网: https://matrix.yyc3.top
// ============================================================
```

## 五、工程规范

### 命名规范

| 类别 | 规范 |
|------|------|
| 文件 / 路由 | kebab-case（如 `user-profile.tsx`、`api/users/route.ts`） |
| 组件 / 类 | PascalCase（如 `FamilyChatPanel`） |
| 变量 / 函数 / Hook | camelCase（如 `useFamilyChat`） |
| 常量 | UPPER_SNAKE_CASE（如 `MAX_RETRY_COUNT`） |

### 代码规范

- 遵循 ESLint / Prettier 统一配置；TypeScript 严格模式，禁用 `any`
- 每个源文件必须含标头注释；复杂逻辑必须加行内注释
- 组件完整定义 Props 类型，必填/可选清晰，支持 className 扩展
- 通用逻辑抽离为自定义 Hook 与纯工具函数，遵循单一职责与 DRY

### 提交规范（Conventional Commits）

```
<type>(<scope>): <subject>

type: feat | fix | docs | style | refactor | perf | test | build | ci | chore | revert
示例: feat(navigator): add intent classification cache
```

### 默认技术栈

Next.js 14+ App Router · React 18+ · TypeScript strict · pnpm · shadcn/ui · Radix UI · Tailwind CSS。服务端组件优先；数据请求用 Server Actions + fetch；静态资源用 next/image、next/font。

## 六、检查清单

### 黄金标准 · 五高（架构方案自评）

| 维度 | 自检问题 |
|------|----------|
| 高可用 | 有无降级/兜底策略？故障能否自愈？ |
| 高性能 | 首字节/响应时间目标？有无缓存与懒加载？ |
| 高安全 | 鉴权、注入防护、数据加密、审计日志是否齐备？ |
| 高扩展 | 能否水平扩展？新模块/插件能否动态接入？ |
| 高智能 | 是否具备自适应/学习能力？ |

### 五标（过程规范）

标准化（统一接口/协议规范）· 规范化（编码/文档/提交流程规范）· 自动化（测试/审查/文档生成自动化）· 可视化（质量看板/链路追踪）· 智能化（智能审查/自适应阈值）。

### 五化（转型角色）

流程化（嵌入协同闭环）· 数字化（数据资产化）· 生态化（开放集成）· 工具化（CLI/插件工具链）· 服务化（能力即服务 API）。

### 五维（评估坐标）

时间维（延迟/响应目标）· 空间维（存储/资源约束）· 属性维（准确率/覆盖率阈值）· 事件维（追踪/记录完整性）· 关联维（依赖/影响可追溯）。

### 风险分级（先知 × 守护共用）

| 级别 | 含义 | 处置 |
|------|------|------|
| P0 | 阻断：安全漏洞、数据丢失、架构性错误 | 必须修复后方可交付，上报天枢危机总控 |
| P1 | 必修：明显缺陷、性能劣化、规范违背 | 本轮闭环内修复 |
| P2 | 建议：优化空间、技术债务、风格改进 | 记录并纳入后续迭代 |

### 家族徽章（可选，用于 README / Wiki）

```markdown
![言启·千行](https://img.shields.io/badge/言启·千行-导航员-%230088cc?style=flat&logo=compass)
![语枢·万物](https://img.shields.io/badge/语枢·万物-思考者-%23c0c0c0?style=flat&logo=graph)
![预见·先知](https://img.shields.io/badge/预见·先知-预言家-%234b0082?style=flat&logo=crystalball)
![千里·伯乐](https://img.shields.io/badge/千里·伯乐-推荐官-%23dc143c?style=flat&logo=heart)
![元启·天枢](https://img.shields.io/badge/元启·天枢-总指挥-%235e2c8a?style=flat&logo=rose)
![智云·守护](https://img.shields.io/badge/智云·守护-安全官-%23333?style=flat&logo=shield)
![格物·宗师](https://img.shields.io/badge/格物·宗师-质量官-%232e8b57?style=flat&logo=code)
![创想·灵韵](https://img.shields.io/badge/创想·灵韵-创意官-%23ff8c00?style=flat&logo=lightbulb)
```
