export interface PointerPoint {
  x: number;
  y: number;
}

export interface PointerViewport {
  width: number;
  height: number;
}

export interface PointerFilterConfig {
  minCutoff: number;
  beta: number;
  derivativeCutoff: number;
  deadzonePx: number;
}

export class PointerFilter {
  private readonly x: OneEuroScalar;
  private readonly y: OneEuroScalar;
  private readonly deadzonePx: number;
  private lastTimestampMs: number | null = null;
  private output: PointerPoint | null = null;

  constructor(config: PointerFilterConfig) {
    this.x = new OneEuroScalar(config.minCutoff, config.beta, config.derivativeCutoff);
    this.y = new OneEuroScalar(config.minCutoff, config.beta, config.derivativeCutoff);
    this.deadzonePx = config.deadzonePx;
  }

  update(timestampMs: number, point: PointerPoint, viewport: PointerViewport): PointerPoint {
    if (this.lastTimestampMs !== null && timestampMs <= this.lastTimestampMs) this.reset();
    const deltaSeconds = this.lastTimestampMs === null
      ? null
      : Math.max((timestampMs - this.lastTimestampMs) / 1000, Number.EPSILON);
    this.lastTimestampMs = timestampMs;
    const filtered = {
      x: this.x.update(point.x, deltaSeconds),
      y: this.y.update(point.y, deltaSeconds),
    };
    if (!this.output) {
      this.output = filtered;
      return { ...filtered };
    }
    const width = Math.max(viewport.width, 1);
    const height = Math.max(viewport.height, 1);
    const movementPx = Math.hypot(
      (filtered.x - this.output.x) * width,
      (filtered.y - this.output.y) * height,
    );
    if (movementPx < this.deadzonePx) return { ...this.output };
    this.output = filtered;
    return { ...filtered };
  }

  reset(): void {
    this.x.reset();
    this.y.reset();
    this.lastTimestampMs = null;
    this.output = null;
  }
}

class OneEuroScalar {
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly derivativeCutoff: number;
  private value: number | null = null;
  private previousRaw: number | null = null;
  private derivative = 0;

  constructor(minCutoff: number, beta: number, derivativeCutoff: number) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.derivativeCutoff = derivativeCutoff;
  }

  update(raw: number, deltaSeconds: number | null): number {
    if (this.value === null || deltaSeconds === null) {
      this.value = raw;
      this.previousRaw = raw;
      this.derivative = 0;
      return raw;
    }
    const rawDerivative = (raw - (this.previousRaw ?? raw)) / deltaSeconds;
    this.previousRaw = raw;
    this.derivative = lowPass(
      rawDerivative,
      this.derivative,
      smoothingAlpha(this.derivativeCutoff, deltaSeconds),
    );
    const cutoff = this.minCutoff + this.beta * Math.abs(this.derivative);
    this.value = lowPass(raw, this.value, smoothingAlpha(cutoff, deltaSeconds));
    return this.value;
  }

  reset(): void {
    this.value = null;
    this.previousRaw = null;
    this.derivative = 0;
  }
}

function smoothingAlpha(cutoff: number, deltaSeconds: number): number {
  const timeConstant = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + timeConstant / deltaSeconds);
}

function lowPass(value: number, previous: number, alpha: number): number {
  return alpha * value + (1 - alpha) * previous;
}
