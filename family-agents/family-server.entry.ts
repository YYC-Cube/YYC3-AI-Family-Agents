// @ts-nocheck
/**
 * 家族服务进程入口（family-server.entry）—— P6-A（M14）· 部署侧装配。
 * 职责：把内核 08 的 MCP 服务端装配与 09 指标暴露组装为可启动进程：
 *   manifest 条目（部署侧解析注入）→ instrumentSkillRegistry 装载（skills_loaded 记账）
 *   → assembleMcpServer（准入裁决 + dispatch 仪表化，mcp_tool_calls / plugin_denied 记账）
 *   → startMetricsServer（/metrics · 默认 9464，能力供给三族指标出真值）。
 *   缺省 dispatch = 注册表 introspection（工具名 → logicalId 互查并回技能元数据；
 *   未注册抛错走 isError）；真实技能执行器（steps 解释执行）后续里程碑只换 dispatch 即可接入。
 * 边界：本入口核心零文件 IO——配置对象由 startFamilyServer 调用方注入（CLI 模式经
 *       stdin 收运行器注入的 JSON）；family-agents → architecture-kernel 单向依赖。
 */

import { readFileSync, realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  SkillRegistry,
  type ManifestSkillEntry,
} from './shared-core/memory-framework/procedural-memory/skill-registry.js';
import { FamilyMetrics } from '../architecture-kernel/09-可观测性/family-metrics.js';
import { startMetricsServer, type MetricsServerHandle } from '../architecture-kernel/09-可观测性/metrics-server.js';
import { instrumentSkillRegistry } from '../architecture-kernel/09-可观测性/capability-instrumentation.js';
import {
  assembleMcpServer,
  type McpAdmissionOptions,
  type McpServerAssembly,
} from '../architecture-kernel/08-系统装配/mcp-server-assembly.js';
import type { McpToolDescriptor, McpToolDispatcher } from '../architecture-kernel/02-云枢核心引擎/mcp-adapter/server/protocol.js';
import {
  executeManifestSkill,
  type ExecutableSkillEntry,
  type SkillExecutionResult,
} from '../architecture-kernel/05-持续学习引擎/skill-consolidation/skill-executor.js';
import type { LearningBudget, PatternTriplet } from '../architecture-kernel/05-持续学习引擎/types.js';
import type { SkillStorePort } from '../architecture-kernel/05-持续学习引擎/learning-loop.js';
import {
  createRuntimeAssembly,
  type RuntimeAssembly,
} from '../architecture-kernel/08-系统装配/runtime-assembly.js';
import {
  executeSkillWithLlm,
  createLlmStepRunner,
  LlmUsageCounter,
  type LlmStepRunner,
} from './shared-core/llm-adapter/skill-step-executor.js';
import { ZhiPuProvider } from './shared-core/llm-adapter/zhipu-provider.js';
import { OpenAiProvider } from './shared-core/llm-adapter/openai-provider.js';
import {
  CardDirectory,
  type A2aAgentCard,
} from '../architecture-kernel/a2a-adapter/card-discovery.js';
import { DelegateClient, type A2aTransport } from '../architecture-kernel/a2a-adapter/task-delegate.js';

/** 真实 A2A HTTP 传输（M22）：POST JSON-RPC；端点为部署侧实例契约值（非用户输入，无 SSRF 面）。 */
class HttpA2aTransport implements A2aTransport {
  constructor(private readonly opts: { timeoutMs: number; token?: string }) {}
  async send(url: string, body: string): Promise<string> {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.opts.token ? { authorization: `Bearer ${this.opts.token}` } : {}),
      },
      body,
      signal: AbortSignal.timeout(this.opts.timeoutMs),
    });
    if (!res.ok) throw new Error(`A2A 上游 HTTP ${res.status}`);
    return res.text();
  }
}

/** 外部家人（A2A）编排配置（M22 · P7-c）：注入 transport/card 供 hermetic 测试。 */
export interface ExternalFamilyOptions {
  /** 外部端点（部署侧实例契约值，如 http://127.0.0.1:3130）。 */
  readonly endpoint: string;
  readonly tokenEnv?: string;
  readonly timeoutMs?: number;
  readonly skills?: readonly string[];
  /** 测试注入：fake 传输（提供时不做网络发现）。 */
  readonly transport?: A2aTransport;
  /** 测试注入：直接提供 card（跳过网络发现）。 */
  readonly card?: A2aAgentCard;
}

/** MCP 工具名 → 清单技能 logicalId（gen-mcp-tools 映射 `.`→`__`、`-`→`_` 的逆变换）。 */
export function logicalIdOfTool(toolName: string): string {
  return toolName.replace(/__/g, '.').replace(/_/g, '-');
}

/** 服务配置（全部注入式；资产读取归 scripts/start-family-server.mjs）。 */
export interface FamilyServerConfig {
  readonly serverInfo: { readonly name: string; readonly version: string };
  readonly tools: readonly McpToolDescriptor[];
  readonly manifestEntries: readonly ManifestSkillEntry[];
  readonly admission?: McpAdmissionOptions;
  readonly pluginOfTool?: (toolName: string) => string;
  readonly dispatch?: McpToolDispatcher;
  /** 外部家人 A2A 编排（M22 · P7-c）：配置后 `shared.a2a-delegate` 工具真实委托外部端点。 */
  readonly external?: ExternalFamilyOptions;
  /** LLM 语义执行臂（M16）：注入式 runner（测试假件）——提供时优先于 provider 构造。 */
  readonly llmRunner?: LlmStepRunner;
  /** LLM 语义执行臂（M16）：真实 provider 配置（密钥经环境变量由 provider 自取；
   *  启动器侧受三闸门控 LLM_STEP=1 + LLM_STEP_CONFIRM + API Key，缺省不启用）。 */
  readonly llm?: {
    readonly provider: 'zhipu' | 'openai';
    readonly model?: string;
    readonly apiKeyEnv?: string;
    readonly baseUrl?: string;
  };
  readonly metricsServer?: { readonly port?: number; readonly host?: string; readonly authToken?: string };
  /**
   * 学习闭环装配（M28 · 部署侧合流）：配置即嵌入内核 createRuntimeAssembly——
   * 每次分派完成发布一条 `task.executed` 总线事件馈入学习管道（失败轨迹 completed=false）；
   * 调度闸 usageMeter 自动接 llmUsage 计数器（provider 臂启用时真实计量，零实耗全额归还）；
   * 固化落位接服务注册表（promoted 技能经 learned.* 归并 id 可 registry.findByLogicalId 查得）。
   */
  readonly learning?: {
    /** 技能库落盘目录（缺省 ./data/skills；测试注入 store 优先）。 */
    readonly storeDir?: string;
    /** 测试注入：技能库端口（如 InMemorySkillStore）。 */
    readonly store?: SkillStorePort;
    /** 学习调度闸（透传 createRuntimeAssembly.learningScheduler；usageMeter 自动接线）。 */
    readonly scheduler?: {
      readonly total: LearningBudget;
      readonly tokensPerCycle?: number;
      /** 任务时钟（缺省 Date.now；测试可冻结）。 */
      readonly now?: () => number;
    };
    /** 学习管道透传：统一 logicalId 解析（缺省 FNV → learned.* 归并）。 */
    readonly logicalIdResolver?: (pattern: PatternTriplet) => string | undefined;
    /** 每周期最多固化技能数（缺省 5）。 */
    readonly maxPromotionsPerCycle?: number;
  };
}

/** 服务句柄（最小观测面；stop 幂等）。 */
export interface FamilyServerHandle {
  readonly metrics: FamilyMetrics;
  readonly registry: SkillRegistry;
  readonly mcp: McpServerAssembly;
  /** LLM 语义执行臂（未启用为 undefined；selftest:llm 采样用）。 */
  readonly llmRunner?: LlmStepRunner;
  /** 累计 LLM 用量计数器（P8 收尾 b；provider 构造臂启用即存在——调度闸 usageMeter 端口值）。 */
  readonly llmUsage?: LlmUsageCounter;
  /** 学习闭环装配（M28 · config.learning 配置即存在——bus / bridge / loop / scheduler 观测面）。 */
  readonly learning?: RuntimeAssembly;
  /** 外部家人 A2A 编排（M22；未启用为 undefined）。 */
  readonly a2a?: { readonly directory: CardDirectory; readonly client: DelegateClient };
  readonly metricsServer?: MetricsServerHandle;
  stop(): Promise<void>;
}

/**
 * 基础分派（M15/M16）：确定性技能执行引擎 + LLM 语义执行臂——契约校验先行；
 * 无步骤条目回确定性结果；有步骤且提供 runner 时逐条语义执行（协议层自动 await）。
 */
function baseDispatch(
  registry: SkillRegistry,
  tools: readonly McpToolDescriptor[],
  entriesByLogicalId: ReadonlyMap<string, ExecutableSkillEntry>,
  llmRunner?: LlmStepRunner,
  metrics?: FamilyMetrics,
): McpToolDispatcher {
  const logicalByTool = new Map(
    tools.map((tool) => {
      const extra = tool as { logicalId?: string };
      return [tool.name, extra.logicalId ?? logicalIdOfTool(tool.name)];
    }),
  );
  const resolveEntry = (toolName: string): ExecutableSkillEntry => {
    const logicalId = logicalByTool.get(toolName) ?? logicalIdOfTool(toolName);
    const entry = entriesByLogicalId.get(logicalId);
    if (!entry && !registry.findByLogicalId(logicalId)) throw new Error(`未注册技能：${logicalId}（工具名 ${toolName}）`);
    return entry ?? { id: logicalId };
  };
  const syncArm = (ctx: { toolName: string; args?: unknown }): SkillExecutionResult => {
    const entry = resolveEntry(ctx.toolName);
    const result = executeManifestSkill(entry, (ctx.args ?? {}) as Record<string, unknown>);
    if (!result.inputOk) throw new Error(`输入契约不满足（${entry.id}）：${result.inputViolations.join('；')}`);
    return result;
  };
  if (!llmRunner) return syncArm;
  return (ctx) => {
    const entry = resolveEntry(ctx.toolName);
    const base = executeManifestSkill(entry, (ctx.args ?? {}) as Record<string, unknown>);
    if (!base.inputOk) throw new Error(`输入契约不满足（${entry.id}）：${base.inputViolations.join('；')}`);
    if (!base.llmRequired) return base; // 无步骤条目：确定性结果（同步快速路径）
    return executeSkillWithLlm(entry, (ctx.args ?? {}) as Record<string, unknown>, { runner: llmRunner, metrics });
  };
}

/**
 * 编排分派（M22）：`shared.a2a-delegate` 工具路由经 DelegateClient 真实委托外部家人
 * （traceId 优先级链：ctx 显式/头派生 > UUID 派生 32hex，使外发携带 W3C traceparent）；
 * 其余工具语义不变（委托 baseDispatch）。
 */
function executeDispatch(
  registry: SkillRegistry,
  tools: readonly McpToolDescriptor[],
  entriesByLogicalId: ReadonlyMap<string, ExecutableSkillEntry>,
  llmRunner: LlmStepRunner | undefined,
  metrics: FamilyMetrics,
  a2a: { directory: CardDirectory; client: DelegateClient; allowedSkills: ReadonlySet<string> } | undefined,
): McpToolDispatcher {
  const base = baseDispatch(registry, tools, entriesByLogicalId, llmRunner, metrics);
  if (!a2a) return base;
  const a2aArm = async (ctx: { traceId?: string; args?: unknown }): Promise<unknown> => {
    const args = (ctx.args ?? {}) as { skillId?: unknown; input?: unknown };
    if (typeof args.skillId !== 'string' || args.skillId.length === 0) {
      throw new Error('a2a-delegate 输入契约不满足：缺少 skillId');
    }
    if (a2a.allowedSkills.size > 0 && !a2a.allowedSkills.has(args.skillId)) {
      throw new Error(`外部家人未声明能力 ${args.skillId}（card 能力清单外）`);
    }
    const traceId = ctx.traceId ?? randomUUID().replace(/-/g, '');
    const result = await a2a.client.delegate({ skillId: args.skillId, input: args.input ?? {}, traceId });
    if (!result.ok) throw new Error(`A2A 委托失败（${result.slug ?? '外部家人'}）：${result.reason}`);
    return { delegated: true, traceId: result.traceId, task: result.task };
  };
  return (ctx) => {
    const extra = ctx.toolName as string;
    const logicalId = extra.includes('__') ? logicalIdOfTool(extra) : extra;
    if (logicalId === 'shared.a2a-delegate') return a2aArm(ctx);
    return base(ctx);
  };
}

/**
 * 学习轨迹仪表（M28 · 部署侧合流）：每次分派完成发布一条 `task.executed` 总线事件——
 * 同步结果即发；异步 thenable 结算后发（拒绝也记轨迹，completed=false → failure 负样本）。
 * traceId 优先取调用链上下文，缺省 UUID 派生；幂等键 seq 递增防同刻去重误伤。
 */
function learningDispatch(
  base: McpToolDispatcher,
  learning: RuntimeAssembly,
  serverName: string,
): McpToolDispatcher {
  let seq = 0;
  const report = (ctx: { toolName: string; traceId?: string }, ok: boolean, startedAt: number): void => {
    const traceId = ctx.traceId ?? randomUUID().replace(/-/g, '');
    void learning.bus.publish({
      key: { traceId, agentId: serverName, seq: (seq += 1) },
      topic: 'task.executed',
      mode: 'broadcast',
      payload: {
        agent: serverName,
        taskType: ctx.toolName,
        steps: [{ order: 1, action: `mcp:${ctx.toolName}`, tool: ctx.toolName, ok }],
        startedAt,
        finishedAt: Date.now(),
        completed: ok,
      },
      at: Date.now(),
    });
  };
  return (ctx) => {
    const startedAt = Date.now();
    let out: unknown;
    try {
      out = base(ctx);
    } catch (error) {
      report(ctx, false, startedAt);
      throw error;
    }
    if (out && typeof (out as Promise<unknown>).then === 'function') {
      return (out as Promise<unknown>).then(
        (value) => {
          report(ctx, true, startedAt);
          return value;
        },
        (error) => {
          report(ctx, false, startedAt);
          throw error;
        },
      );
    }
    report(ctx, true, startedAt);
    return out;
  };
}

/** 启动家族服务（装载 → MCP 装配 → 可选 /metrics 暴露）。 */
export async function startFamilyServer(config: FamilyServerConfig): Promise<FamilyServerHandle> {
  const metrics = new FamilyMetrics();
  const registry = instrumentSkillRegistry(new SkillRegistry(), metrics);
  registry.loadFromManifest(config.manifestEntries);
  // 执行引擎索引：清单条目自带 steps/io 契约（P3-T1②），注册表定义不含正文
  const entriesByLogicalId = new Map(
    (config.manifestEntries as readonly ExecutableSkillEntry[]).map((entry) => [entry.id, entry]),
  );
  // LLM 语义执行臂（M16）：注入 runner 优先；provider 由部署配置构造（真实调用受启动器三闸门控）；
  // P8 收尾 b：provider 构造臂自动挂 LlmUsageCounter（真实 usage 计量，句柄 llmUsage 暴露）
  let llmUsage: LlmUsageCounter | undefined;
  const llmRunner: LlmStepRunner | undefined =
    config.llmRunner ??
    (config.llm
      ? createLlmStepRunner(
          config.llm.provider === 'openai'
            ? new OpenAiProvider(
                config.llm.apiKeyEnv ?? 'OPENAI_API_KEY',
                config.llm.baseUrl ?? 'https://api.openai.com/v1',
              )
            : new ZhiPuProvider(
                config.llm.apiKeyEnv ?? 'ZHIPU_API_KEY',
                config.llm.baseUrl ?? 'https://open.bigmodel.cn/api/paas/v4',
              ),
          config.llm.model ?? (config.llm.provider === 'openai' ? 'gpt-4o-mini' : 'glm-4-flash'),
          1024,
          (llmUsage = new LlmUsageCounter()),
        )
      : undefined);

  // 外部家人 A2A 编排（M22 · P7-c）：card 目录 + 委托客户端（注入 card/transport 供测试）
  let a2a: { directory: CardDirectory; client: DelegateClient; allowedSkills: ReadonlySet<string> } | undefined;
  if (config.external) {
    const ext = config.external;
    const transport = ext.transport ?? new HttpA2aTransport({
      timeoutMs: ext.timeoutMs ?? 5_000,
      token: ext.tokenEnv ? process.env[ext.tokenEnv] : undefined,
    });
    let card = ext.card;
    if (!card) {
      // 真实模式：启动期发现外部 card（well-known）；仅 http(s)（部署配置端点，非用户输入）
      const parsed = new URL(ext.endpoint);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`外部端点仅允许 http(s)（实际 ${parsed.protocol}）`);
      }
      const res = await fetch(`${ext.endpoint.replace(/\/+$/, '')}/.well-known/agent-card.json`, {
        signal: AbortSignal.timeout(ext.timeoutMs ?? 5_000),
      });
      if (!res.ok) throw new Error(`外部 card 发现失败：HTTP ${res.status}`);
      const raw = (await res.json()) as { agentCard?: { name?: string; description?: string; url?: string; version?: string; skills?: { id: string; name?: string; description?: string }[] } };
      const ac = raw.agentCard;
      if (!ac?.name || !ac.url || !Array.isArray(ac.skills)) throw new Error('外部 card 形态非法（agentCard.name/url/skills 必需）');
      card = {
        name: ac.name,
        description: ac.description ?? '',
        url: ac.url,
        version: ac.version ?? '1.0.0',
        skills: ac.skills.map((s) => ({ id: s.id, name: s.name ?? s.id, description: s.description ?? '' })),
      };
    }
    const directory = new CardDirectory();
    directory.register(card);
    a2a = {
      directory,
      client: new DelegateClient({ directory, transport }),
      allowedSkills: new Set(ext.skills ?? card.skills.map((s) => s.id)),
    };
  }

  // 学习闭环装配（M28 · 部署侧合流）：嵌入内核运行时——总线 ← 分派轨迹（learningDispatch），
  // 调度闸 usageMeter ← llmUsage 真实计量（provider 臂启用时），固化落位 ← 服务注册表
  const learning = config.learning
    ? createRuntimeAssembly({
        ...(config.learning.store
          ? { store: config.learning.store }
          : { skillStoreDir: config.learning.storeDir ?? './data/skills' }),
        metrics,
        skillRegistry: registry,
        learning: {
          logicalIdResolver: config.learning.logicalIdResolver,
          ...(config.learning.maxPromotionsPerCycle !== undefined
            ? { maxPromotionsPerCycle: config.learning.maxPromotionsPerCycle }
            : {}),
        },
        ...(config.learning.scheduler
          ? {
              learningScheduler: {
                total: config.learning.scheduler.total,
                ...(config.learning.scheduler.tokensPerCycle !== undefined
                  ? { tokensPerCycle: config.learning.scheduler.tokensPerCycle }
                  : {}),
                ...(config.learning.scheduler.now ? { now: config.learning.scheduler.now } : {}),
                ...(llmUsage ? { usageMeter: () => llmUsage.totalTokens } : {}),
              },
            }
          : {}),
      })
    : undefined;
  const dispatcher: McpToolDispatcher =
    config.dispatch ??
    executeDispatch(registry, config.tools, entriesByLogicalId, llmRunner, metrics, a2a);

  const mcp = assembleMcpServer({
    serverInfo: config.serverInfo,
    tools: config.tools,
    admission: config.admission,
    pluginOfTool: config.pluginOfTool,
    dispatch: learning ? learningDispatch(dispatcher, learning, config.serverInfo.name) : dispatcher,
    metrics,
  });

  const metricsServer = config.metricsServer
    ? await startMetricsServer({ metrics, ...config.metricsServer })
    : undefined;

  let stopped = false;
  return {
    metrics,
    registry,
    mcp,
    llmRunner,
    ...(llmUsage ? { llmUsage } : {}),
    ...(learning ? { learning } : {}),
    ...(a2a ? { a2a: { directory: a2a.directory, client: a2a.client } } : {}),
    metricsServer,
    async stop() {
      if (stopped) return;
      stopped = true;
      await metricsServer?.close();
    },
  };
}

/** CLI 模式（`node family-server.entry.js [--selftest]`）：stdin 收配置 JSON，由运行器注入。 */
async function main(): Promise<number> {
  const config = JSON.parse(readFileSync(0, 'utf8')) as FamilyServerConfig;
  const server = await startFamilyServer(config);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const out = server.mcp.handler.handle(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    );
    const text = typeof (out && (out as Promise<string>).then) === 'function' ? await out : out;
    if (process.env.YYC3_SELFTEST_DEBUG) console.log(`  [debug] text=${typeof text} ${String(text).slice(0, 120)}`);
    return JSON.parse(text as string);
  };

  if (process.argv.includes('--selftest')) {
    const listed = JSON.parse(server.mcp.handler.handle(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })));
    const sample = listed.result.tools[0] as { name?: string } | undefined;
    // 按条目 io.input 构造合法入参（执行引擎契约校验所需）
    const entryById = new Map((config.manifestEntries as readonly ExecutableSkillEntry[]).map((e) => [e.id, e]));
    const sampleLogical = sample?.name ? logicalIdOfTool(sample.name) : '';
    const sampleEntry = entryById.get(sampleLogical);
    const sampleArgs: Record<string, string> = {};
    for (const field of sampleEntry?.io?.input ?? []) sampleArgs[field] = '自检输入';
    const ok = sample ? await call(sample.name as string, sampleArgs) : undefined;
    const missing = await call('definitely__unknown_tool');
    console.log(`selftest：装载 ${server.registry.list().length} 条 · 目录 ${listed.result.tools.length} 工具`);
    if (ok) {
      if (ok.result?.isError) {
        console.log(`  执行 ${String(sample?.name)} → isError（${ok.result.content[0].text.slice(0, 120)}）`);
      } else if (ok.result) {
        const executed = JSON.parse(ok.result.content[0].text) as SkillExecutionResult;
        console.log(
          `  执行 ${String(sample?.name)} → triggered=${String(executed.triggered)} · plan ${executed.plan.length} 步 · 输出骨架 ${Object.keys(executed.output).join('/') || '（无 io 声明）'}`,
        );
      } else {
        console.log(`  执行 ${String(sample?.name)} → 异常响应 ${JSON.stringify(ok).slice(0, 220)}`);
      }
    }
    // 未知/未准入工具：可见性闸回 -32602（先于策略与分派，不泄露存在性、不计 error）
    console.log(`  调用未知工具 → error.code=${String(missing.error?.code)}（预期 -32602，可见性拦截）`);
    console.log('  能力供给指标摘录：');
    const capLines = server.metrics.render().split('\n').filter((line) => line.startsWith('family_capability_'));
    if (capLines.length === 0) console.log('  （无样本：能力供给计数器零样本）');
    for (const line of capLines) console.log(`  ${line}`);

    // LLM 自检采样（M17 · selftest:llm）：经完整协议链路（策略→异步分派→仪表计账）
    const llmSample = Number(process.argv.find((a) => a.startsWith('--llm-sample='))?.split('=')[1] ?? 0);
    if (llmSample > 0) {
      if (!server.llmRunner) {
        console.log('  LLM 自检：语义臂未启用（三闸门控未放行），跳过');
      } else {
        const samples = (config.manifestEntries as readonly ExecutableSkillEntry[]).filter(
          (e) => (e.steps?.length ?? 0) > 0 && (e.io?.input?.length ?? 0) > 0 && (e.io?.output?.length ?? 0) > 0,
        ).slice(0, llmSample);
        let filled = 0;
        let fields = 0;
        for (const e of samples) {
          const toolName = e.id.replace(/\./g, '__').replace(/-/g, '_');
          const args: Record<string, string> = {};
          for (const f of e.io?.input ?? []) args[f] = 'LLM 自检输入';
          const res = await call(toolName, args);
          if (res.result?.isError) {
            console.log(`  LLM ${e.id} → isError（${res.result.content[0].text.slice(0, 80)}）`);
            fields += e.io?.output?.length ?? 0;
            continue;
          }
          const executed = JSON.parse(res.result.content[0].text) as {
            output: Record<string, unknown>;
            outputViolations?: readonly string[];
          };
          const got = Object.values(executed.output).filter((v) => v !== null && v !== '').length;
          filled += got;
          fields += e.io?.output?.length ?? 0;
          const extra = got === 0 && executed.outputViolations?.length ? `（末步产物字段：${executed.outputViolations.join('；').slice(0, 120)}）` : '';
          console.log(`  LLM ${e.id} → 填充 ${got}/${e.io?.output?.length ?? 0}${extra}`);
        }
        console.log(`  LLM 自检汇总：输出字段填充 ${filled}/${fields}（${samples.length} 技能 · 真实计费调用 · 累计 ${server.llmUsage?.snapshot().totalTokens ?? 0} tokens）`);
      }
    }
    // 外部家人真实委托采样（M22）：实例契约自动装配时经完整协议链路委托一次
    if (server.a2a && config.external) {
      const skill = (config.external.skills ?? [])[0];
      if (skill) {
        const res = await call('shared__a2a_delegate', { skillId: skill, input: { probe: 'selftest' } });
        if (res.result?.isError) {
          console.log(`  A2A 委托 ${skill} → isError（${res.result.content[0].text.slice(0, 100)}）`);
        } else {
          const delegated = JSON.parse(res.result.content[0].text);
          console.log(`  A2A 委托 ${skill} → taskId=${String(delegated.task?.taskId)} state=${String(delegated.task?.state)}（真实外部端点）`);
        }
      }
    }
    if (server.learning) {
      console.log(`  学习闭环：bus 桥接受理 ${server.learning.bridge.stats.accepted} 条轨迹（M28 部署侧合流）`);
    }
    await server.stop();
    await server.stop(); // 幂等验证
    const okPass = ok ? ok.result.isError === false : true;
    const missingPass = missing.error?.code === -32602;
    return okPass && missingPass ? 0 : 1;
  }

  console.log(`YYC³ 家族服务（P6-A 雏形）已就绪`);
  console.log(`  技能装载：${server.registry.list().length} 条（skills_loaded 已记账）`);
  console.log(`  MCP 处理器：无状态 JSON-RPC（initialize/ping/tools/list/tools/call）`);
  console.log(`  /metrics：${server.metricsServer?.url ?? '（未启用）'}`);
  console.log('  Ctrl+C 优雅停止');
  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  await server.stop();
  return 0;
}

// 直接执行（非被 import）时进入 CLI 模式；配置 JSON 由运行器经 stdin 注入。
// realpath 对齐两侧：模块加载器按真实路径解析 import.meta.url（macOS /var → /private/var
// 符号链接会使 pathToFileURL(argv[1]) 与之不等，守卫静默失效）。
function isMainEntry(): boolean {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isMainEntry()) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`❌ 家族服务异常退出：${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
