/**
 * 技能注册中心（skill-registry）——「知/学」支柱 procedural-memory 子模块。
 * 职责：承载**可版本化**的技能定义（工具使用模式 / 工作流能力）。
 * 生命周期：版本化永久｜存储介质：Git 版本化 YAML｜写入触发：学习引擎固化 / 人工审核。
 *
 * TODO(infra): 技能定义落盘为 Git YAML（procedural/*.yaml），支持 A/B 对比与回滚。
 */

/** 技能定义（可版本化）。 */
export interface SkillDefinition {
  readonly id: string;
  /**
   * 统一命名空间 id（P3-T3）：manifest 技能即其契约 id；学习沉淀为 `learned.*`
   * （格式契约见 architecture-kernel/05-持续学习引擎/skill-consolidation/skill-id.ts，
   * 本模块不 import 内核——id 格式即接口，依赖方向红线）。
   */
  readonly logicalId?: string;
  readonly name: string;
  /** 语义化版本，如 "1.2.0"。 */
  readonly version: string;
  readonly description: string;
  /** 触发条件（如意图类型 / 前置事实）。 */
  readonly when: readonly string[];
  /** 执行步骤（工具调用序列 / 工作流引用）。 */
  readonly steps: readonly SkillStep[];
  /** 生命周期状态。 */
  readonly status: 'active' | 'deprecated' | 'rolled-back';
}

/**
 * manifest 技能条目（P3-T3 加载器输入）：由部署侧从 presets/family-manifest.yaml
 * 解析注入（运行时不做 YAML 解析，保持零依赖）；字段为清单技能段的子集。
 */
export interface ManifestSkillEntry {
  readonly id: string;
  /** 缺省按 "0.0.0" 加载（清单强校验后实际总有值）。 */
  readonly version?: string;
  readonly name: string;
  readonly description: string;
  readonly scope: 'shared' | 'dedicated';
  /** 专用技能的家人编号（清单原文，slug 映射由部署侧完成）。 */
  readonly owner?: string;
  readonly kernel?: string;
  readonly examples?: readonly string[];
  /** `planned` 条目未实装，加载器跳过。 */
  readonly status?: string;
}

/** 清单加载结果（幂等：同 id 同版本覆盖，不产生重复）。 */
export interface ManifestLoadResult {
  readonly loaded: number;
  /** 因 `status: planned` 被跳过的条目 id。 */
  readonly skippedPlanned: readonly string[];
}

/**
 * 技能元数据索引条目（P3-T4 渐进披露）：仅含检索所需元数据（id + 一句描述 + tags），
 * 不含 steps / examples 等正文；格式契约见 architecture-kernel/05-持续学习引擎/
 * skill-consolidation/skill-index.ts（本模块不 import 内核——id 格式即接口）。
 */
export interface SkillIndexEntry {
  readonly id: string;
  readonly version?: string;
  readonly scope?: 'shared' | 'dedicated';
  readonly owner?: string;
  readonly description: string;
  readonly tags?: readonly string[];
}

/** 查询分词（确定性）：CJK 相邻二元组（单字回退）+ latin/digit 词，统一小写。 */
function tokenizeQuery(query: string): readonly string[] {
  const lower = query.toLowerCase();
  const tokens = new Set<string>();
  for (const run of lower.match(/[\u3000-\u9fff\uff00-\uffef]+/g) ?? []) {
    if (run.length === 1) {
      tokens.add(run);
    } else {
      for (let i = 0; i < run.length - 1; i += 1) tokens.add(run.slice(i, i + 2));
    }
  }
  for (const word of lower.match(/[a-z0-9][a-z0-9-]*/g) ?? []) tokens.add(word);
  return [...tokens];
}

/**
 * 纯索引匹配（P3-T4）：tag 命中权重 3 > id 命中 2 > 描述命中 1，同分按 id 升序；
 * 只读索引条目，不触碰任何正文（steps / examples）。
 */
export function matchSkillIndexEntries(
  entries: readonly SkillIndexEntry[],
  query: string,
  limit = 5,
): readonly SkillIndexEntry[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];
  const scored: Array<{ entry: SkillIndexEntry; score: number }> = [];
  for (const entry of entries) {
    let score = 0;
    const tags = (entry.tags ?? []).join(' ').toLowerCase();
    const id = entry.id.toLowerCase();
    const description = entry.description.toLowerCase();
    for (const token of tokens) {
      if (tags.includes(token)) score += 3;
      if (id.includes(token)) score += 2;
      if (description.includes(token)) score += 1;
    }
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
  return scored.slice(0, limit).map((s) => s.entry);
}

/** 技能步骤。 */
export interface SkillStep {
  readonly order: number;
  readonly action: string;
  readonly tool?: string;
  readonly notes?: string;
}

/** 技能注册中心端口。 */
export interface SkillRegistryPort {
  register(skill: SkillDefinition): SkillDefinition;
  get(id: string, version?: string): SkillDefinition | undefined;
  /** 取某技能的最新 active 版本。 */
  latest(id: string): SkillDefinition | undefined;
  list(): readonly SkillDefinition[];
  /** 回滚到上一版本（对接自愈中心 §5.5 学习回滚）。 */
  rollback(id: string): SkillDefinition | undefined;
  /** 按统一 logicalId 查询最新 active 技能（P3-T3，与 manifest/学习引擎互查）。 */
  findByLogicalId(logicalId: string): SkillDefinition | undefined;
  /** 从 manifest 技能条目批量加载（P3-T3；planned 条目跳过；幂等）。 */
  loadFromManifest(entries: readonly ManifestSkillEntry[]): ManifestLoadResult;
  /** 批量装载元数据索引（P3-T4；幂等，同 id 覆盖；返回当前索引条数）。 */
  loadIndex(entries: readonly SkillIndexEntry[]): number;
  /** 当前索引条目快照（id 升序不确定，按装载顺序）。 */
  listIndex(): readonly SkillIndexEntry[];
  /** 渐进披露检索（P3-T4）：先查索引不读正文，命中后由调用方经 findByLogicalId 加载全量定义。 */
  match(query: string, limit?: number): readonly SkillIndexEntry[];
}

/** 技能注册中心实现（内存桩，多版本共存）。 */
export class SkillRegistry implements SkillRegistryPort {
  /** id → (version → definition) */
  private readonly versions = new Map<string, Map<string, SkillDefinition>>();

  /** 元数据索引（P3-T4）：与正文注册表（versions）物理分离。 */
  private readonly indexEntries = new Map<string, SkillIndexEntry>();

  register(skill: SkillDefinition): SkillDefinition {
    const byVersion = this.versions.get(skill.id) ?? new Map<string, SkillDefinition>();
    byVersion.set(skill.version, skill);
    this.versions.set(skill.id, byVersion);
    // TODO(infra): 写入 Git 版本化 YAML
    return skill;
  }

  get(id: string, version?: string): SkillDefinition | undefined {
    const byVersion = this.versions.get(id);
    if (!byVersion) return undefined;
    if (version) return byVersion.get(version);
    return this.latest(id);
  }

  latest(id: string): SkillDefinition | undefined {
    const byVersion = this.versions.get(id);
    if (!byVersion) return undefined;
    // 桩：以版本字符串降序取 active 版本
    return [...byVersion.values()]
      .filter((s) => s.status === 'active')
      .sort((a, b) => compareSemver(b.version, a.version))[0];
  }

  list(): readonly SkillDefinition[] {
    const out: SkillDefinition[] = [];
    for (const byVersion of this.versions.values()) {
      out.push(...byVersion.values());
    }
    return out;
  }

  rollback(id: string): SkillDefinition | undefined {
    const byVersion = this.versions.get(id);
    if (!byVersion) return undefined;
    const ordered = [...byVersion.values()].sort((a, b) => compareSemver(b.version, a.version));
    const current = ordered[0];
    const prev = ordered[1]; // 次新版本
    if (current) byVersion.set(current.version, { ...current, status: 'rolled-back' });
    if (prev) {
      const reActivated: SkillDefinition = { ...prev, status: 'active' };
      byVersion.set(prev.version, reActivated);
      // TODO(infra): 触发 Git tag 回退 + 稳定性回归（stability-guard）
      return reActivated;
    }
    return undefined;
  }

  findByLogicalId(logicalId: string): SkillDefinition | undefined {
    for (const byVersion of this.versions.values()) {
      for (const skill of byVersion.values()) {
        if (skill.status === 'active' && (skill.logicalId ?? skill.id) === logicalId) {
          return this.latest(skill.id);
        }
      }
    }
    return undefined;
  }

  loadFromManifest(entries: readonly ManifestSkillEntry[]): ManifestLoadResult {
    const skippedPlanned: string[] = [];
    let loaded = 0;
    for (const entry of entries) {
      // planned 条目未实装：不注入运行时（契约侧由 manifest:check 记账）
      if (entry.status === 'planned') {
        skippedPlanned.push(entry.id);
        continue;
      }
      this.register({
        id: entry.id,
        logicalId: entry.id, // manifest 技能的统一 id 即契约 id
        name: entry.name,
        version: entry.version ?? '0.0.0',
        description: entry.description,
        when: entry.examples ?? [],
        steps: [],
        status: 'active',
      });
      loaded += 1;
    }
    return { loaded, skippedPlanned };
  }

  loadIndex(entries: readonly SkillIndexEntry[]): number {
    for (const entry of entries) {
      if (!entry.id) throw new Error('索引条目缺少 id');
      this.indexEntries.set(entry.id, entry);
    }
    return this.indexEntries.size;
  }

  listIndex(): readonly SkillIndexEntry[] {
    return [...this.indexEntries.values()];
  }

  match(query: string, limit = 5): readonly SkillIndexEntry[] {
    return matchSkillIndexEntries([...this.indexEntries.values()], query, limit);
  }
}

/** 语义化版本比较（简化：按数值段比较）。 */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
