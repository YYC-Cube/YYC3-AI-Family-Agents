/**
 * 云枢电话系统（family-phone-system）—— 通讯录 / 专属热线 / 通话 / 私信。
 * 边界：只负责家族内部通讯；跨模块投递经 family-communication-bus。
 *
 * TODO(infra): 接入实时通话通道与私信存储；专属热线号码绑定。
 */

import type { CallRecord, Contact, DirectMessage } from '../types.js';

/** 云枢电话系统。 */
export class PhoneSystem {
  private readonly contacts = new Map<string, Contact>();

  /** 登记联系人（含专属热线）。 */
  register(contact: Contact): void {
    this.contacts.set(contact.id, contact);
  }

  /** 查看通讯录。 */
  directory(): readonly Contact[] {
    return [...this.contacts.values()];
  }

  /** 拨打专属热线。 */
  async call(from: string, to: string): Promise<CallRecord> {
    // TODO(infra): 建立通话会话并记录结果
    return { id: `call-${from}-${to}`, from, to, startedAt: Date.now() };
  }

  /** 发送私信。 */
  async sendDirect(message: DirectMessage): Promise<void> {
    // TODO(infra): 经 family-communication-bus 投递私信
    void message;
  }
}
