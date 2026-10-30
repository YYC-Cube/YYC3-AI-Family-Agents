/**
 * LLM 技能步骤执行器（skill-step-executor）—— P6-C（M16）· 语义执行臂。
 * 职责：在确定性执行臂（kernel skill-executor）之上，对 plan 中 `exec:'llm'`
 *   的自然语言步骤做语义执行——逐条构造步骤提示词 → 注入式 runner（provider 或测试假件）
 *   → 围栏剥离与 JSON 抽取 → 累积中间产物 → 以末步产物填充 io.output 骨架。
 * 边界：本模块不做网络（runner 注入式；真实 provider 由部署侧/启动器构造并受三闸门控）；
 *       输入契约校验沿用确定性臂语义（违反即抛，走 isError 可观测）；
 *       family-agents → architecture-kernel 单向依赖。
 */

import type { FamilyMetrics } from '../../../architecture-kernel/09-可观测性/family-metrics.js';
import {
  executeManifestSkill,
  type ExecutableSkillEntry,
  type SkillExecutionResult,
  type StepPlanItem,
} from '../../../architecture-kernel/05-持续学习引擎/skill-consolidation/skill-executor.js';
import type { ChatMessage, CompletionRequest } from './types.js';

/** 单步执行 runner：收步骤提示词，回文本（通常为 JSON）。 */
export type LlmStepRunner = (
  messages: readonly ChatMessage[],
  step: { readonly order: number; readonly text: string },
) => Promise<string>;

/** provider 最小结构（ZhiPu / OpenAI provider 结构兼容；usage 缺省视为不可计量）。 */
interface ProviderLike {
  complete(req: CompletionRequest): Promise<{
    text: string;
    usage?: { readonly promptTokens: number; readonly completionTokens: number };
  }>;
}

/** 用量分桶标签（E0b 计量分口径：三维可聚合，缺省归 others）。 */
export interface LlmUsageTags {
  readonly agentId?: string;
  readonly skillId?: string;
  readonly scenario?: string;
}

/**
 * 累计 LLM 用量计数器（P8 收尾 b · usage 回填生产端）：真实 provider usage 逐调用
 * 累计；totalTokens 即运行时装配调度闸 usageMeter 端口值（份额记账冲抵）。
 * E0b 分口径：record 可附三维 tags（agentId/skillId/scenario），分桶快照供
 * /metrics 聚合导出（家族用量报表口径地基）。
 */
export class LlmUsageCounter {
  private promptTokens = 0;
  private completionTokens = 0;
  private calls = 0;
  private readonly buckets = new Map<string, { promptTokens: number; completionTokens: number; calls: number }>();

  /** 记一次调用的真实用量（负值按 0 计，防脏数据透支；tags 缺省归 others 桶）。 */
  record(
    usage: { readonly promptTokens: number; readonly completionTokens: number },
    tags?: LlmUsageTags,
  ): void {
    const prompt = Math.max(0, usage.promptTokens);
    const completion = Math.max(0, usage.completionTokens);
    this.promptTokens += prompt;
    this.completionTokens += completion;
    this.calls += 1;
    if (tags) {
      const key = [tags.agentId ?? '', tags.skillId ?? '', tags.scenario ?? ''].join('|');
      const bucket = this.buckets.get(key) ?? { promptTokens: 0, completionTokens: 0, calls: 0 };
      bucket.promptTokens += prompt;
      bucket.completionTokens += completion;
      bucket.calls += 1;
      this.buckets.set(key, bucket);
    }
  }

  /** 累计总 token（prompt + completion）。 */
  get totalTokens(): number {
    return this.promptTokens + this.completionTokens;
  }

  /** 快照（观测/自检输出；buckets 为三维分桶聚合）。 */
  snapshot(): {
    promptTokens: number;
    completionTokens: number;
    calls: number;
    totalTokens: number;
    buckets: readonly {
      agentId: string;
      skillId: string;
      scenario: string;
      promptTokens: number;
      completionTokens: number;
      calls: number;
      totalTokens: number;
    }[];
  } {
    const buckets = [...this.buckets.entries()].map(([key, b]) => {
      const [agentId, skillId, scenario] = key.split('|');
      return {
        agentId,
        skillId,
        scenario,
        promptTokens: b.promptTokens,
        completionTokens: b.completionTokens,
        calls: b.calls,
        totalTokens: b.promptTokens + b.completionTokens,
      };
    });
    return {
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      calls: this.calls,
      totalTokens: this.totalTokens,
      buckets,
    };
  }
}

/** 由 provider 构造 runner（真实调用方；密钥经环境变量由 provider 自取；
 *  meter 注入即逐调用累计真实 usage——调度闸 usage 回填的数据源；
 *  maxTokens 由配置注入（E0c：base.yaml llm.providers.*.max_tokens 档位，
 *  思考型档位建议 3072；超时走 provider 构造 timeoutMs）；缺省维持 1024 向后兼容。 */
export function createLlmStepRunner(
  provider: ProviderLike,
  model: string,
  maxTokens = 1024,
  meter?: LlmUsageCounter,
): LlmStepRunner {
  return (messages) =>
    provider.complete({ model, messages, temperature: 0, maxTokens }).then((r) => {
      if (r.usage) meter?.record(r.usage);
      return r.text;
    });
}

/** 剥离围栏并抽取首个 JSON 对象；无法解析时回退 {raw}。 */
export function extractStepJson(text: string): Record<string, unknown> {
  const stripped = text.replace(/```(?:json)?/gi, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(stripped.slice(start, end + 1));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      /* 回退 raw */
    }
  }
  return { raw: stripped };
}

/** LLM 执行结果：确定性臂字段 + 步骤状态 + 已填充输出。 */
export interface LlmSkillExecutionResult extends SkillExecutionResult {
  readonly mode: 'llm-assisted';
  readonly plan: readonly (StepPlanItem & { readonly status: 'done' })[];
  readonly output: Record<string, unknown>;
  /** io.output 中未被末步产物填充的字段（值为 null）。 */
  readonly outputViolations: readonly string[];
}

/**
 * 语义执行一条清单技能：确定性臂先行（契约校验 + 触发核验），随后逐步骤经
 * runner 执行；末步产物填充 io.output（未覆盖字段留 null 并记 violations）。
 * 输入契约违反直接抛错（与确定性分派同语义）。
 */
export async function executeSkillWithLlm(
  entry: ExecutableSkillEntry,
  input: Readonly<Record<string, unknown>>,
  options: { readonly runner: LlmStepRunner; readonly metrics?: FamilyMetrics },
): Promise<LlmSkillExecutionResult> {
  const base = executeManifestSkill(entry, input);
  if (!base.inputOk) throw new Error(`输入契约不满足（${entry.id}）：${base.inputViolations.join('；')}`);

  const artifacts: Record<string, unknown>[] = [];
  const donePlan: (StepPlanItem & { status: 'done' })[] = [];
  const total = base.plan.length;
  for (const step of base.plan) {
    const messages: readonly ChatMessage[] = [
      {
        role: 'system',
        content:
          `你是 YYC³ 家族技能执行器。技能 ${entry.id} 共 ${total} 步，当前执行第 ${step.order} 步：${step.text}。` +
          '只输出本步骤执行后的中间产物 JSON 对象（无围栏、无解释文字，字段名用英文）。' +
          (step.order === total && (entry.io?.output?.length ?? 0) > 0
            ? `这是最终步骤：产物必须且只需包含以下字段：${(entry.io?.output ?? []).join(', ')}。`
            : ''),
      },
      {
        role: 'user',
        content: `输入：${JSON.stringify(input)}\n已完成步骤产物：${JSON.stringify(artifacts)}`,
      },
    ];
    const text = await options.runner(messages, { order: step.order, text: step.text });
    artifacts.push(extractStepJson(text));
    donePlan.push({ ...step, status: 'done' });
  }

  const final = artifacts[artifacts.length - 1] ?? {};
  const output: Record<string, unknown> = {};
  const outputViolations: string[] = [];
  for (const field of entry.io?.output ?? []) {
    const value = final[field];
    if (value !== undefined && value !== null && value !== '') output[field] = value;
    else {
      output[field] = null;
      outputViolations.push(`输出字段未填充：${field}`);
    }
  }
  // M19 观测增强：步骤数与填充率自动上报（metrics 注入即接线）
  const fields = entry.io?.output?.length ?? 0;
  options.metrics?.recordLlmExecution(entry.id, donePlan.length, fields - outputViolations.length, fields);

  return { ...base, mode: 'llm-assisted', plan: donePlan, output, outputViolations };
}
