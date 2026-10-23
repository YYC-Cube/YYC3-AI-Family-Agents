/**
 * A2A 适配层 · Card 发现（card-discovery · P2-T2）—— 「治」支柱生态外挂。
 * 职责：`/.well-known/agent-card.json` 路径映射 + 内存 Card 注册表（发现/枚举）。
 * 边界：**纯内存 stub，零网络**——真实发现由部署侧 transport 完成；
 *       card 形态复用 assets/agent-cards/（8 张既有卡，schema 对齐 A2A）。
 * 红线：零运行时依赖；不 import family-agents。
 */

/** Agent Card（与 assets/agent-cards/*.json 的 agentCard 字段同构，最小契约面）。 */
export interface A2aAgentCard {
  readonly name: string;
  readonly description: string;
  /** 服务基址（如 https://matrix.yyc3.top/family/tianshu）。 */
  readonly url: string;
  readonly version: string;
  readonly skills: readonly {
    readonly id: string;
    readonly name: string;
    readonly description: string;
  }[];
}

/** A2A 1.0 规范的 well-known 发现路径。 */
export const WELL_KNOWN_PATH = '/.well-known/agent-card.json';

/** 由服务基址推导 well-known 发现 URL（P2 本轮补充建议：直接映射，不新建格式）。 */
export function wellKnownPath(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${WELL_KNOWN_PATH}`;
}

/** 从 card.url 提取 slug（末段）。 */
export function slugOf(card: A2aAgentCard): string {
  const parts = card.url.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] ?? '';
}

/**
 * 内存 Card 注册表（发现/枚举；零网络）。
 * 登记:部署侧把已发现的 card 装入；发现:按 slug 或能力 id 检索。
 */
export class CardDirectory {
  private readonly bySlug = new Map<string, A2aAgentCard>();

  register(card: A2aAgentCard): A2aAgentCard {
    this.bySlug.set(slugOf(card), card);
    return card;
  }

  /** 按 slug 发现（A2A card 发现语义）。 */
  discover(slug: string): A2aAgentCard | undefined {
    return this.bySlug.get(slug);
  }

  /** 按能力（技能）id 找到可委托的 card（跨家人委托入口）。 */
  findByCapability(skillId: string): A2aAgentCard | undefined {
    for (const card of this.bySlug.values()) {
      if (card.skills.some((s) => s.id === skillId)) return card;
    }
    return undefined;
  }

  list(): readonly A2aAgentCard[] {
    return [...this.bySlug.values()];
  }

  get size(): number {
    return this.bySlug.size;
  }
}
