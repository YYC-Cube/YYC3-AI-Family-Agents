/**
 * 场景画像注册中心（profile-registry）—— E4a · 众口登记簿（演进集 v1.2.0 解冻第一波）。
 * 职责：三级画像（业务线 × 用户 × 场景偏好）的登记/查询/换档解析——
 *   同一技能在不同画像下自动换 model tier 与输出风格，且计量按画像分口径
 *   （scenario 标签 `llm-assisted@<profileId>`，消费 family_llm_usage 计数器）。
 * 边界：运行时零依赖（画像定义 YAML 由部署侧解析注入——manifest 同范式，
 *       结构校验归 scripts/check-profiles.mjs）；画像数据最小够用（伯乐原则），
 *       不存敏感个人信息；tier 为档位名（模型名归部署侧 env，拍板前一律占位）。
 * 人格红线：owner 只能是八家人 slug（定数）——校验归 check-profiles，运行时信任注入。
 */

/** 模型档位（占位语义 `${LLM_STEP_TIER:-flagship}`——强推理位拍板后回填实际映射）。 */
export type ModelTier = 'reasoning' | 'flagship' | 'speed';

/** 画像偏好（字段最小够用）。 */
export interface ProfilePreferences {
  /** 模型档位偏好（投资人简报 → reasoning；日常运营 → speed）。 */
  readonly tier: ModelTier;
  /** 输出风格（如「结构化简报」「对话流」）。 */
  readonly outputStyle: string;
  /** 预算档（E1a 账本预留位，可选）。 */
  readonly budgetTier?: 'strict' | 'standard' | 'relaxed';
  /** 语言习惯（可选）。 */
  readonly languageStyle?: string;
}

/** 画像定义（三级：domain 业务线 × user 用户 × scenario 场景）。 */
export interface ProfileDefinition {
  readonly id: string;
  /** 业务线（酒店投资 / 品牌 / 0379 八场景等）。 */
  readonly domain: string;
  /** 承载家人 slug（八人定数）。 */
  readonly owner: string;
  readonly user?: string;
  readonly scenario?: string;
  readonly preferences: ProfilePreferences;
  /** 业务域 Prompt 要点（E1b golden 业务卷题源）。 */
  readonly promptAnchors: readonly string[];
}

/** 换档解析结果（供模型选择与计量分口径）。 */
export interface ResolvedProfile {
  readonly profileId: string;
  readonly modelTier: ModelTier;
  readonly outputStyle: string;
  /** 计量分口径标签：`llm-assisted@<profileId>`（无画像归 `llm-assisted`）。 */
  readonly scenarioTag: string;
}

/** 全局缺省档位：`${LLM_STEP_TIER:-flagship}` 占位（拍板后回填）。env 注入（provider 同范式）。 */
export function tierFromEnv(env?: Readonly<Record<string, string | undefined>>): ModelTier {
  const value = env?.LLM_STEP_TIER;
  return value === 'reasoning' || value === 'flagship' || value === 'speed' ? value : 'flagship';
}

/** 场景画像注册中心。 */
export class ProfileRegistry {
  private readonly profiles = new Map<string, ProfileDefinition>();
  private readonly defaultTier: ModelTier;

  constructor(defaultTier?: ModelTier) {
    this.defaultTier = defaultTier ?? 'flagship'; // 占位语义 ${LLM_STEP_TIER:-flagship}——部署侧解析 env 后传入
  }

  /** 登记画像（同 id 重复注册视为装配错误）。 */
  register(profile: ProfileDefinition): void {
    if (this.profiles.has(profile.id)) throw new Error(`画像重复注册：${profile.id}`);
    this.profiles.set(profile.id, profile);
  }

  /** 批量登记。 */
  loadAll(profiles: readonly ProfileDefinition[]): void {
    for (const profile of profiles) this.register(profile);
  }

  /** 按 id 取画像。 */
  get(id: string): ProfileDefinition | undefined {
    return this.profiles.get(id);
  }

  /** 全量（id 升序）。 */
  list(): readonly ProfileDefinition[] {
    return [...this.profiles.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * 换档解析：画像偏好生效（tier + 输出风格 + 分口径标签）；
   * 无画像/未登记 → 缺省档（`${LLM_STEP_TIER:-flagship}` 占位语义）+ 基础标签。
   */
  resolve(profileId?: string): ResolvedProfile {
    const profile = profileId ? this.profiles.get(profileId) : undefined;
    if (!profile) {
      return { profileId: profileId ?? 'default', modelTier: this.defaultTier, outputStyle: 'default', scenarioTag: 'llm-assisted' };
    }
    return {
      profileId: profile.id,
      modelTier: profile.preferences.tier,
      outputStyle: profile.preferences.outputStyle,
      scenarioTag: `llm-assisted@${profile.id}`,
    };
  }
}
