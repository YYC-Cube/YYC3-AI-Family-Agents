/**
 * 云枢电话系统（family-phone-system）—— 通讯录 / 专属热线 / 通话 / 私信。
 * 语义（M26 由桩转实）：
 *   - call(from, to)：建立通话记录（注入 now/seq 保证 id 稳定可测），
 *     `endCall` 回填 durationMs/outcome；`callLog` 只读查询；
 *     无人接听语义由 `endCall(id, 'missed' | 'rejected')` 表达；
 *   - sendDirect(message)：入站/出站信箱存储（按参与者查询），
 *     可选注入 `MessageDeliveryPort`（经 family-communication-bus 投递的
 *     装配适配点——投递失败不落信箱，如实上抛）；
 *   - `contactByHotline`：专属热线反查（热线绑定语义落地）。
 * 边界：只负责家族内部通讯；跨模块投递经 family-communication-bus（端口注入）。
 */

import type { CallRecord, Contact, DirectMessage } from '../types.js';

/** 私信投递端口（装配侧实现：接总线 point-to-point）。 */
export interface MessageDeliveryPort {
  deliver(message: DirectMessage): Promise<void>;
}

/** 云枢电话系统。 */
export class PhoneSystem {
  private readonly contacts = new Map<string, Contact>();
  private readonly calls = new Map<string, CallRecord>();
  private readonly inbox = new Map<string, DirectMessage[]>();
  private readonly outbox = new Map<string, DirectMessage[]>();
  private seq = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly delivery?: MessageDeliveryPort,
  ) {}

  /** 登记联系人（含专属热线；同 id 覆盖更新）。 */
  register(contact: Contact): void {
    this.contacts.set(contact.id, contact);
  }

  /** 查看通讯录（登记序）。 */
  directory(): readonly Contact[] {
    return [...this.contacts.values()];
  }

  /** 按专属热线反查联系人（未绑定返回 undefined）。 */
  contactByHotline(hotline: string): Contact | undefined {
    for (const contact of this.contacts.values()) {
      if (contact.hotline === hotline) return contact;
    }
    return undefined;
  }

  /** 拨打专属热线：建立通话记录（outcome 待 endCall 回填）。 */
  async call(from: string, to: string): Promise<CallRecord> {
    const record: CallRecord = {
      id: `call-${++this.seq}-${from}-${to}`,
      from,
      to,
      startedAt: this.now(),
    };
    this.calls.set(record.id, record);
    return record;
  }

  /** 结束通话：回填时长与结果（未登记的通话完成调用方持有端信息可补录）。 */
  endCall(id: string, outcome: 'answered' | 'missed' | 'rejected', endedAt: number = this.now()): CallRecord | undefined {
    const record = this.calls.get(id);
    if (!record) return undefined;
    const ended: CallRecord = {
      ...record,
      durationMs: Math.max(0, endedAt - record.startedAt),
      outcome,
    };
    this.calls.set(id, ended);
    return ended;
  }

  /** 通话记录（开始序只读快照）。 */
  callLog(): readonly CallRecord[] {
    return [...this.calls.values()];
  }

  /** 发送私信：投递端口成功后入双方信箱（无端口则仅入信箱——家族内部存储语义）。 */
  async sendDirect(message: DirectMessage): Promise<void> {
    if (this.delivery) await this.delivery.deliver(message);
    this.outbox.set(message.from, [...(this.outbox.get(message.from) ?? []), message]);
    this.inbox.set(message.to, [...(this.inbox.get(message.to) ?? []), message]);
  }

  /** 收件箱（到达序）。 */
  inboxOf(agent: string): readonly DirectMessage[] {
    return this.inbox.get(agent) ?? [];
  }

  /** 发件箱（发送序）。 */
  outboxOf(agent: string): readonly DirectMessage[] {
    return this.outbox.get(agent) ?? [];
  }
}
