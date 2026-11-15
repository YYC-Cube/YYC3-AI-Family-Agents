# embedded-kernel · 内核消费样板（C2）

`@yyc3/ai-family-kernel` 进程内嵌入最小示例——**零运行时依赖**，任何 Node ≥20 TS/JS 项目 `npm i` 即用。

```bash
npm i
npx tsx src/main.ts        # 装配 + 插拔点注入演示
```

要点：

- **最小嵌入**：`createRuntimeAssembly()` 全缺省可跑（技能库落盘 `./data/skills`）。
- **插拔点**：`store`（任意持久化）· `metrics`（自动埋点）· `learningScheduler`（学习配额闸）· `nineLayer`（层级健康探针）· `onRollback`（自愈观测）——13 端口全表见根仓《可复用性分析》§三。
- **事件入口**：`bus`（总线）· `bridge`（学习轨迹回流）· `loop`（学习循环）——内核唯一入口，其余为观测面。
