/**
 * 对话上下文管理（context-manager.service）——就绪·域包执行员 core。
 * 自动生成自 presets/member-agent；请补齐 TODO(infra) 与业务逻辑。
 * 职责：维护多轮对话上下文，输出可注入 LLM 的窗口内容。
 * 边界：上下文存储归 memory-framework working-context；本服务负责编排与裁剪。
 *
 * TODO(infra): 接入 working-context（内存 + Redis）持久化会话；
 *              接入 context-window 做 token 预算裁剪。
 */

import type { WorkingItem } from '@shared/memory-framework';

/** 单轮对话。 */
export interface Turn {
  readonly role: 'user' | 'assistant' | 'system';
  readonly text: string;
  readonly ts: number;
}

/** 上下文构建结果。 */
export interface BuiltContext {
  readonly sessionId: string;
  readonly items: readonly WorkingItem[];
  readonly summary?: string;
  readonly usedTokens: number;
}

/** 对话上下文管理服务。 */
export class ContextManagerService {
  /** sessionId → 对话轮次（桩：内存） */
  private readonly sessions = new Map<string, Turn[]>();

  constructor(private readonly defaultWindowTokens = 128_000) {}

  /** 追加一轮对话。 */
  appendTurn(sessionId: string, turn: Turn): void {
    const turns = this.sessions.get(sessionId) ?? [];
    turns.push(turn);
    this.sessions.set(sessionId, turns);
    // TODO(infra): 写入 memory-framework working-context（Redis 会话键）
  }

  /** 读取某会话的全部轮次。 */
  turns(sessionId: string): readonly Turn[] {
    return this.sessions.get(sessionId) ?? [];
  }

  /**
   * 构建可注入的上下文窗口。
   * @param query 当前查询（用于注意力排序）
   * @param budgetTokens token 预算（缺省 128K）
   */
  buildContext(
    sessionId: string,
    query: string,
    budgetTokens = this.defaultWindowTokens,
  ): BuiltContext {
    const turns = this.turns(sessionId);
    const items: WorkingItem[] = turns.map((t, i) => ({
      id: `${sessionId}-turn-${i}`,
      content: t,
      salience: t.role === 'user' ? 0.8 : 0.5,
      lastAccessTs: t.ts,
      keywords: tokenize(t.text),
    }));
    // TODO(infra): 委托 memory-framework ContextWindow 做精确 token 分配与摘要压缩
    void query;
    // 桩实现：超预算时按新近度截断（保留最近轮次）
    const kept: WorkingItem[] = [];
    let used = 0;
    for (const it of [...items].reverse()) {
      const cost = estimateTokens(it.content);
      if (used + cost > budgetTokens) break;
      kept.unshift(it);
      used += cost;
    }
    return { sessionId, items: kept, usedTokens: used, summary: undefined };
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** 上下文窗口容量校验。 */
  withinBudget(ctx: BuiltContext, budgetTokens = this.defaultWindowTokens): boolean {
    return ctx.usedTokens <= budgetTokens;
  }
}

function tokenize(text: string): string[] {
  return text
    .split(/[\s,，。、;；:：]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function estimateTokens(content: unknown): number {
  const text = typeof content === 'string' ? content : JSON.stringify(content ?? '');
  return Math.max(1, Math.ceil(text.length / 4));
}
