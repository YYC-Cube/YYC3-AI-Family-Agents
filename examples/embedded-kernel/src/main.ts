/**
 * 内核消费样板（C2 · 本地开发即插即用）——最小嵌入四步：
 *   ① npm i @yyc3/ai-family-kernel
 *   ② createRuntimeAssembly（缺省即可运行：FileSkillStore ./data/skills）
 *   ③ 注入插拔点（store / metrics / learningScheduler / nineLayer / onRollback…）
 *   ④ 驱动事件与观测（bus 轨迹 → 学习回流；metrics 记账；handleSignal 自愈链）
 *
 * 运行：npx tsx src/main.ts（或 npx tsc && node dist/main.js）
 * 13 插拔点全表见根仓《可复用性分析》§三 / 接入指南第三部分 3.2。
 */
import { createRuntimeAssembly } from '@yyc3/ai-family-kernel/runtime-assembly';
import { FamilyMetrics } from '@yyc3/ai-family-kernel/family-metrics';

// 最小装配：全缺省（FileSkillStore 落盘 ./data/skills · 零外部依赖）
const rt = createRuntimeAssembly({});

// 注入插拔点：指标集（自动埋点：桥接受理/学习周期/自愈记账与 RTO）+ 回滚观测回调
const withMetrics = createRuntimeAssembly({
  metrics: new FamilyMetrics(),
  onRollback: (event, outcome) => {
    console.log(`[healing] ${event.skillId} → ${outcome.action}`);
  },
});

console.log('✅ 内核装配就绪：');
console.log('  store    :', rt.store.constructor.name);
console.log('  metrics  :', withMetrics.metrics ? '已注入（自动埋点）' : '未注入');
console.log('  插拔点全表见《可复用性分析》§三（13 端口）——bus/bridge/loop 为事件唯一入口');
