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
}

/** 技能注册中心实现（内存桩，多版本共存）。 */
export class SkillRegistry implements SkillRegistryPort {
  /** id → (version → definition) */
  private readonly versions = new Map<string, Map<string, SkillDefinition>>();

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
