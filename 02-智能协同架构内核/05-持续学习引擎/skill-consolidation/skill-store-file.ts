// @ts-nocheck
/**
 * 技能文件落盘（skill-store-file）—— infra 集成位 3（§6.4）。
 * 职责：把 SkillStorePort 持久化到文件系统——每技能一个 JSON 文件，
 *       进程重启后技能历史可恢复（版本共存 + 回滚状态一并落盘）。
 * 边界：只做持久化读写；版本决策归 skill-versioner，固化预算归 learning-loop。
 *
 * v2.5.0（infra-3）实装：
 *   - `{dir}/{skillId}.json` 一技能一文件，内容为 SkillDefinition[]（含历史版本）；
 *   - 写入为原子替换语义（writeFileSync 全量覆盖；生产对接 Git 版本化 YAML，
 *     见 memory-framework MEMORY_LIFECYCLE.procedural）。
 * 说明：node:fs 无 @types/node，按仓库约定以 @ts-nocheck 垫片（同 scripts/ 范式）。
 */

import fs from 'node:fs';
import path from 'node:path';
import type { SkillDefinition } from '../../05-持续学习引擎/types.js';
import type { SkillStorePort } from '../../05-持续学习引擎/learning-loop.js';

/** 文件系统技能库。 */
export class FileSkillStore implements SkillStorePort {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  /** 读取技能完整历史；文件缺失或损坏时返回空历史（损坏文件不抛错，待下次写覆盖）。 */
  historyOf(skillId: string): readonly SkillDefinition[] {
    try {
      const raw = fs.readFileSync(this.fileOf(skillId), 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** 全量替换该技能历史并落盘。 */
  replaceHistory(skillId: string, history: readonly SkillDefinition[]): void {
    fs.writeFileSync(this.fileOf(skillId), JSON.stringify(history, null, 2), 'utf-8');
  }

  /** 扫描目录收集全部 active 技能。 */
  activeSkills(): readonly SkillDefinition[] {
    const out: SkillDefinition[] = [];
    for (const name of fs.readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue;
      const history = this.historyOf(name.replace(/\.json$/, ''));
      for (const skill of history) {
        if (skill.status === 'active') out.push(skill);
      }
    }
    return out;
  }

  /** 已落盘技能数（供观测）。 */
  size(): number {
    return fs.readdirSync(this.dir).filter((n) => n.endsWith('.json')).length;
  }

  private fileOf(skillId: string): string {
    // 技能 ID 形如 skill-xxxxxxxx（FNV 十六进制），天然文件名安全；仍做一次兜底净化
    return path.join(this.dir, `${skillId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
  }
}
