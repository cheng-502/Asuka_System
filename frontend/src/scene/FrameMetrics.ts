export interface FrameMetricsSnapshot {
  readonly frames: number;
  readonly durationMs: number;
  readonly fps: number;
  readonly maxFrameMs: number;
}

export class FrameMetrics {
  snapshot: FrameMetricsSnapshot | null = null;
  private firstTimestampMs: number | null = null;
  private sampleStartedAtMs: number | null = null;
  private previousTimestampMs: number | null = null;
  private frames = 0;
  private maxFrameMs = 0;

  constructor(
    private readonly warmupMs = 2_000,
    private readonly sampleDurationMs = 10_000,
  ) {
    if (warmupMs < 0 || sampleDurationMs <= 0) throw new RangeError("metric windows must be positive");
  }

  record(timestampMs: number): void {
    if (this.snapshot || !Number.isFinite(timestampMs)) return;
    if (this.firstTimestampMs === null) this.firstTimestampMs = timestampMs;
    const effectiveTimestamp = Math.max(timestampMs, this.previousTimestampMs ?? timestampMs);
    if (effectiveTimestamp - this.firstTimestampMs < this.warmupMs) {
      this.previousTimestampMs = effectiveTimestamp;
      return;
    }
    if (this.sampleStartedAtMs === null) {
      this.sampleStartedAtMs = effectiveTimestamp;
      this.previousTimestampMs = effectiveTimestamp;
      return;
    }
    const frameMs = effectiveTimestamp - (this.previousTimestampMs ?? effectiveTimestamp);
    this.previousTimestampMs = effectiveTimestamp;
    if (frameMs > 0) {
      this.frames += 1;
      this.maxFrameMs = Math.max(this.maxFrameMs, frameMs);
    }
    const durationMs = effectiveTimestamp - this.sampleStartedAtMs;
    if (durationMs < this.sampleDurationMs) return;
    this.snapshot = Object.freeze({
      frames: this.frames,
      durationMs,
      fps: durationMs > 0 ? this.frames * 1_000 / durationMs : 0,
      maxFrameMs: this.maxFrameMs,
    });
  }
}
