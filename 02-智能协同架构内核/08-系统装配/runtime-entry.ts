// @ts-nocheck
/**
 * 运行时入口（runtime-entry）—— 装配层的进程级启动门面（v2.7.1，验收 L1 / L6 闭环）。
 * 职责：
 *   1. 构造 FamilyMetrics 并装配五支柱运行时（createRuntimeAssembly，带指标埋点）；
 *   2. 启动 `/metrics` 暴露服务（默认回环 + 可选 Bearer 鉴权）；
 *   3. 周期性把「自评-外验一致性」快照写入指标（gateway 与观测解耦，部署侧注入快照源）。
 * 边界：只做启动编排与定时上报；指标语义归 09-可观测性，业务决策归各支柱。
 *
 * 依赖方向：08 → { 02-云枢核心引擎, 05, 07, 09 }，不反向。
 * 生命周期：`stop()` 幂等——清理定时器并关闭 HTTP 服务；定时器已 unref，
 *          不会在无其他事件时阻止进程退出（测试与短生命周期脚本安全）。
 */

import { createRuntimeAssembly, type RuntimeAssembly, type RuntimeAssemblyOptions } from './runtime-assembly.js';
import { FamilyMetrics } from '../09-可观测性/family-metrics.js';
import { startMetricsServer, type MetricsServerHandle } from '../09-可观测性/metrics-server.js';
import type { ConsistencySnapshot } from '../02-云枢核心引擎/cloud-pivot-orchestrator/verification-gateway/consistency-metrics.js';

/** 一致性快照源（部署侧注入 ConsistencyTracker 或等价实现）。 */
export interface ConsistencySource {
  snapshot(): ConsistencySnapshot;
}

/** 启动选项。 */
export interface RuntimeEntryOptions {
  /** 装配选项透传（store / skillStoreDir / learning / onRollback 等）。 */
  readonly assembly?: RuntimeAssemblyOptions;
  /** 技能落盘目录快捷方式（等价 assembly.skillStoreDir）。 */
  readonly storeDir?: string;
  /** `/metrics` 端口，默认 9464；0 表示系统随机分配。 */
  readonly port?: number;
  /** 监听地址，默认 127.0.0.1（回环）；跨机抓取须显式 '0.0.0.0' 并配置 authToken。 */
  readonly host?: string;
  /** Bearer 令牌（可选）。 */
  readonly authToken?: string;
  /** 一致性快照源（提供则首次立即上报 + 定时上报）。 */
  readonly consistencySource?: ConsistencySource;
  /** 一致性上报周期毫秒，默认 15000；≤0 表示只做首报不上定时器。 */
  readonly consistencyIntervalMs?: number;
  /** 启动日志输出（默认 console.log；测试可传空函数）。 */
  readonly log?: (message: string) => void;
}

/** 运行句柄。 */
export interface RuntimeHandle {
  readonly assembly: RuntimeAssembly;
  readonly metrics: FamilyMetrics;
  readonly server: MetricsServerHandle;
  /** 立即上报一次一致性快照（无快照源时为空操作）。 */
  reportConsistency(): void;
  /** 幂等停止：清理定时器 + 关闭指标服务。 */
  stop(): Promise<void>;
}

/**
 * 启动五支柱运行时。
 * 装配时序沿用 runtime-assembly（store → hook → loop → bridge → attach），
 * 指标集由本入口创建并注入，部署侧无需重复构造 FamilyMetrics。
 */
export async function startRuntime(options: RuntimeEntryOptions = {}): Promise<RuntimeHandle> {
  const log = options.log ?? ((message: string) => console.log(message));
  const metrics = new FamilyMetrics();

  const assembly = createRuntimeAssembly({
    ...options.assembly,
    skillStoreDir: options.storeDir ?? options.assembly?.skillStoreDir,
    metrics,
  });

  const server = await startMetricsServer({
    metrics,
    port: options.port,
    host: options.host,
    authToken: options.authToken,
  });

  const source = options.consistencySource;
  const reportConsistency = (): void => {
    if (!source) return;
    metrics.recordConsistency(source.snapshot());
  };
  reportConsistency(); // 首报：即使后续无样本，告警也有初始值

  const interval = options.consistencyIntervalMs ?? 15_000;
  let timer: ReturnType<typeof setInterval> | undefined;
  if (source && interval > 0) {
    timer = setInterval(reportConsistency, interval);
    timer.unref?.(); // 不阻止进程退出
  }

  let closed = false;
  const stop = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
    await server.close();
    log('[yyc3-runtime] 已停止');
  };

  log(
    `[yyc3-runtime] 已启动：metrics=${server.url}/metrics，技能库=${options.storeDir ?? options.assembly?.skillStoreDir ?? './data/skills'}${options.authToken ? '（Bearer 鉴权已启用）' : ''}`,
  );

  return { assembly, metrics, server, reportConsistency, stop };
}

/**
 * 从环境变量启动（部署侧零参数接入）：
 *   YYC3_SKILL_STORE_DIR   技能落盘目录，默认 ./data/skills
 *   YYC3_METRICS_PORT      端口，默认 9464（0 = 随机）
 *   YYC3_METRICS_HOST      监听地址，默认 127.0.0.1
 *   YYC3_METRICS_TOKEN     Bearer 令牌（可选，设置即启用鉴权）
 *   YYC3_CONSISTENCY_INTERVAL_MS 一致性上报周期，默认 15000
 */
export async function startRuntimeFromEnv(
  options: Omit<RuntimeEntryOptions, 'storeDir' | 'port' | 'host' | 'authToken' | 'consistencyIntervalMs'> = {},
): Promise<RuntimeHandle> {
  const env = process.env;
  const port = env.YYC3_METRICS_PORT ? Number.parseInt(env.YYC3_METRICS_PORT, 10) : undefined;
  const interval = env.YYC3_CONSISTENCY_INTERVAL_MS
    ? Number.parseInt(env.YYC3_CONSISTENCY_INTERVAL_MS, 10)
    : undefined;
  return startRuntime({
    ...options,
    storeDir: env.YYC3_SKILL_STORE_DIR,
    port: Number.isFinite(port) ? port : undefined,
    host: env.YYC3_METRICS_HOST,
    authToken: env.YYC3_METRICS_TOKEN,
    consistencyIntervalMs: Number.isFinite(interval) ? interval : undefined,
  });
}
