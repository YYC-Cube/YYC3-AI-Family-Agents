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
import {
  executeSkillWithLlm,
  createLlmStepRunner,
  type LlmStepRunner,
} from './shared-core/llm-adapter/skill-step-executor.js';
import { ZhiPuProvider } from './shared-core/llm-adapter/zhipu-provider.js';
import { OpenAiProvider } from './shared-core/llm-adapter/openai-provider.js';

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
}

/** 服务句柄（最小观测面；stop 幂等）。 */
export interface FamilyServerHandle {
  readonly metrics: FamilyMetrics;
  readonly registry: SkillRegistry;
  readonly mcp: McpServerAssembly;
  /** LLM 语义执行臂（未启用为 undefined；selftest:llm 采样用）。 */
  readonly llmRunner?: LlmStepRunner;
  readonly metricsServer?: MetricsServerHandle;
  stop(): Promise<void>;
}

/**
 * 缺省分派：确定性技能执行引擎（M15）+ 可选 LLM 语义执行臂（M16）——
 * 契约校验先行；无步骤条目回确定性结果；有步骤且提供 runner 时逐条语义执行
 * （异步分派，协议层自动 await）。LLM 臂未启用时保持同步确定性臂（缺省语义不变）。
 */
function executeDispatch(
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

/** 启动家族服务（装载 → MCP 装配 → 可选 /metrics 暴露）。 */
export async function startFamilyServer(config: FamilyServerConfig): Promise<FamilyServerHandle> {
  const metrics = new FamilyMetrics();
  const registry = instrumentSkillRegistry(new SkillRegistry(), metrics);
  registry.loadFromManifest(config.manifestEntries);
  // 执行引擎索引：清单条目自带 steps/io 契约（P3-T1②），注册表定义不含正文
  const entriesByLogicalId = new Map(
    (config.manifestEntries as readonly ExecutableSkillEntry[]).map((entry) => [entry.id, entry]),
  );
  // LLM 语义执行臂（M16）：注入 runner 优先；provider 由部署配置构造（真实调用受启动器三闸门控）
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
        )
      : undefined);

  const mcp = assembleMcpServer({
    serverInfo: config.serverInfo,
    tools: config.tools,
    admission: config.admission,
    pluginOfTool: config.pluginOfTool,
    dispatch:
      config.dispatch ??
      executeDispatch(registry, config.tools, entriesByLogicalId, llmRunner, metrics),
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
        console.log(`  LLM 自检汇总：输出字段填充 ${filled}/${fields}（${samples.length} 技能 · 真实计费调用）`);
      }
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
