/**
 * 感知缓冲（sensory-buffer）——「知」支柱第 1 层。
 * 生命周期：秒级（会话内）｜存储介质：内存环形缓冲｜写入触发：输入到达即写。
 *
 * TODO(infra): 真实实现应把环形缓冲落到 Redis Stream / 内存映射文件，
 *              并接入多模态摄入管道（text/audio/image/event）。
 */

/** 感知样本（单条原始输入）。 */
export interface SensorySample {
  readonly id: string;
  readonly modality: 'text' | 'audio' | 'image' | 'event';
  readonly content: unknown;
  /** 事件时间（传感器产生时刻）。 */
  readonly ts: number;
}

/** 感知缓冲端口（供 memory-orchestrator 依赖注入）。 */
export interface SensoryBufferPort {
  push(sample: Omit<SensorySample, 'id'>): SensorySample;
  recent(limit?: number): readonly SensorySample[];
  /** 取出并移除所有早于 `now - ttlMs` 的样本。 */
  drainExpired(now: number): readonly SensorySample[];
  clear(): void;
}

/**
 * 内存环形缓冲实现（最小可用桩）。
 * 容量固定，写入 O(1)，过期样本由 drainExpired 惰性回收。
 */
export class SensoryBuffer implements SensoryBufferPort {
  private readonly slots: (SensorySample | undefined)[];
  private head = 0;
  private size = 0;
  private seq = 0;

  constructor(
    private readonly capacity = 256,
    private readonly ttlMs = 5_000,
  ) {
    this.slots = new Array<SensorySample | undefined>(this.capacity).fill(undefined);
  }

  push(sample: Omit<SensorySample, 'id'>): SensorySample {
    const entry: SensorySample = { ...sample, id: this.nextId() };
    // 环形覆盖：容量满时推进 head（最旧项被覆盖）
    this.slots[this.head] = entry;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size += 1;
    // TODO(infra): 写入 Redis Stream / 多模态摄入管道
    return entry;
  }

  recent(limit = this.size): readonly SensorySample[] {
    const out: SensorySample[] = [];
    for (let i = Math.max(0, this.size - limit); i < this.size; i += 1) {
      const idx = (this.head - this.size + i + this.capacity) % this.capacity;
      const item = this.slots[idx];
      if (item) out.push(item);
    }
    return out;
  }

  drainExpired(now: number): readonly SensorySample[] {
    const expired: SensorySample[] = [];
    const kept = this.recent().filter((s) => {
      if (now - s.ts > this.ttlMs) {
        expired.push(s);
        return false;
      }
      return true;
    });
    // 重建缓冲（桩实现，重放 retained）
    this.slots.fill(undefined);
    this.head = 0;
    this.size = 0;
    for (const s of kept) this.push({ modality: s.modality, content: s.content, ts: s.ts });
    return expired;
  }

  clear(): void {
    this.slots.fill(undefined);
    this.head = 0;
    this.size = 0;
  }

  private nextId(): string {
    this.seq += 1;
    return `sensory-${Date.now()}-${this.seq}`;
  }
}
