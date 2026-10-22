/**
 * 情感涟漪组件（emotion-ripple）——言启·千行 emotion。「海洋蓝波动」效果骨架。
 * 职责：描述"海洋蓝波动"涟漪的 props 与触发条件（纯 TS，不依赖 UI 框架）。
 * 边界：只提供组件描述与工厂；实际渲染归前端框架（TL6）。
 *
 * TODO(infra): 由前端 renderer 依据描述生成 SVG/CSS 动画；
 *              品牌色来自 agent.yaml（#0088cc）。
 */

/** 涟漪触发条件。 */
export type RippleTrigger =
  | 'message.received' // 收到消息
  | 'intent.detected' // 意图识别成功
  | 'emotion.warm' // 情感温度上升
  | 'achievement.unlock'; // 成就触发

/** 情感涟漪 props（海洋蓝波动）。 */
export interface EmotionRippleProps {
  /** 品牌色（默认海洋蓝）。 */
  readonly color: string;
  /** 触发条件。 */
  readonly trigger: RippleTrigger;
  /** 波幅（0..1）。 */
  readonly amplitude: number;
  /** 持续时间（毫秒）。 */
  readonly durationMs: number;
  /** 同心波层数。 */
  readonly layers: number;
}

/** 组件描述（框架无关）。 */
export interface EmotionRippleDescriptor {
  readonly kind: 'emotion-ripple';
  readonly props: EmotionRippleProps;
}

/** 默认 props（海洋蓝）。 */
export const DEFAULT_EMOTION_RIPPLE: EmotionRippleProps = {
  color: '#0088cc',
  trigger: 'message.received',
  amplitude: 0.6,
  durationMs: 1200,
  layers: 3,
};

/** 创建情感涟漪描述（工厂）。 */
export function createEmotionRipple(
  overrides: Partial<EmotionRippleProps> = {},
): EmotionRippleDescriptor {
  return { kind: 'emotion-ripple', props: { ...DEFAULT_EMOTION_RIPPLE, ...overrides } };
}
