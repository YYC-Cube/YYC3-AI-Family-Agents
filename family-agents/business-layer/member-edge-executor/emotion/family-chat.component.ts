/**
 * 家族消息组件（family-chat）——就绪·域包执行员 emotion。蓝色边框消息样式骨架。
 * 自动生成自 presets/member-agent；纯 TS，不依赖 UI 框架。
 * 职责：描述家族消息气泡的样式 props（蓝色边框）与状态。
 * 边界：只提供样式描述；实际渲染归前端框架（TL6）。
 *
 * TODO(infra): 由前端 renderer 依据描述生成样式（品牌色 #7d9a7f）。
 */

/** 消息角色。 */
export type MessageRole = 'user' | 'family' | 'system';

/** 消息状态。 */
export type MessageState = 'pending' | 'streaming' | 'done' | 'error';

/** 家族消息样式 props。 */
export interface FamilyChatProps {
  readonly role: MessageRole;
  readonly state: MessageState;
  /** 边框色（蓝色）。 */
  readonly borderColor: string;
  /** 圆角（像素）。 */
  readonly radius: number;
  /** 是否显示发言家人名号。 */
  readonly showSpeaker: boolean;
}

/** 组件描述（框架无关）。 */
export interface FamilyChatDescriptor {
  readonly kind: 'family-chat';
  readonly props: FamilyChatProps;
}

/** 默认 props（蓝色边框）。 */
export const DEFAULT_FAMILY_CHAT: FamilyChatProps = {
  role: 'family',
  state: 'done',
  borderColor: '#7d9a7f',
  radius: 12,
  showSpeaker: true,
};

/** 创建家族消息描述（工厂）。 */
export function createFamilyChat(
  overrides: Partial<FamilyChatProps> = {},
): FamilyChatDescriptor {
  return { kind: 'family-chat', props: { ...DEFAULT_FAMILY_CHAT, ...overrides } };
}
