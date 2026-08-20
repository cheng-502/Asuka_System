import type {
  KnowledgeLayoutName,
  KnowledgeSpaceNode,
  KnowledgeSpacePosition,
} from "../data/types";

export const LAYOUT_TRANSITION_MS = 800;
export const COMPACT_TRANSITION_MS = 900;

export class RetargetableVectorTransition {
  readonly current: Float64Array;
  private readonly source: Float64Array;
  private readonly target: Float64Array;
  private startedAt = 0;
  private durationMs = 0;
  private lastTimestampMs: number | null = null;
  active = false;

  constructor(initial: Float64Array) {
    this.current = new Float64Array(initial);
    this.source = new Float64Array(initial);
    this.target = new Float64Array(initial);
  }

  retarget(target: Float64Array, timestampMs: number, durationMs: number, reducedMotion: boolean): void {
    if (target.length !== this.current.length) throw new RangeError("transition target length mismatch");
    if (!Number.isFinite(timestampMs) || !Number.isFinite(durationMs) || durationMs < 0) {
      throw new RangeError("transition timing must be finite and non-negative");
    }
    this.sample(timestampMs);
    this.source.set(this.current);
    this.target.set(target);
    const effectiveTimestamp = Math.max(timestampMs, this.lastTimestampMs ?? timestampMs);
    this.startedAt = effectiveTimestamp;
    this.lastTimestampMs = effectiveTimestamp;
    this.durationMs = durationMs;
    if (reducedMotion || durationMs === 0) {
      this.current.set(this.target);
      this.active = false;
      return;
    }
    this.active = true;
  }

  reset(values: Float64Array): void {
    if (values.length !== this.current.length) throw new RangeError("transition reset length mismatch");
    this.current.set(values);
    this.source.set(values);
    this.target.set(values);
    this.active = false;
    this.lastTimestampMs = null;
  }

  sample(timestampMs: number): Float64Array {
    if (!this.active) return this.current;
    if (!Number.isFinite(timestampMs)) throw new RangeError("transition timestamp must be finite");
    const effectiveTimestamp = Math.max(timestampMs, this.lastTimestampMs ?? timestampMs);
    this.lastTimestampMs = effectiveTimestamp;
    const progress = Math.min(Math.max((effectiveTimestamp - this.startedAt) / this.durationMs, 0), 1);
    const eased = cubicEaseInOut(progress);
    for (let index = 0; index < this.current.length; index += 1) {
      this.current[index] = this.source[index] + (this.target[index] - this.source[index]) * eased;
    }
    if (progress === 1) {
      this.current.set(this.target);
      this.active = false;
    }
    return this.current;
  }
}

export class KnowledgeLayoutState {
  readonly nodeIds: readonly string[];
  readonly transition: RetargetableVectorTransition;
  private readonly targets: Record<KnowledgeLayoutName, Float64Array>;
  private readonly available: ReadonlySet<KnowledgeLayoutName>;
  private targetLayout: KnowledgeLayoutName = "semantic";
  layout: KnowledgeLayoutName = "semantic";

  constructor(nodes: readonly KnowledgeSpaceNode[], availableLayouts: readonly KnowledgeLayoutName[]) {
    this.nodeIds = nodes.map((node) => node.id);
    this.available = new Set(availableLayouts);
    this.targets = {
      semantic: flattenPositions(nodes.map((node) => node.layouts.semantic)),
      galaxy: flattenPositions(nodes.map((node) => node.layouts.galaxy)),
      compact: flattenPositions(nodes.map((node) => node.layouts.compact)),
    };
    this.transition = new RetargetableVectorTransition(this.targets.semantic);
  }

  get current(): Float64Array {
    return this.transition.current;
  }

  get isTransitioning(): boolean {
    return this.transition.active;
  }

  retarget(layout: KnowledgeLayoutName, timestampMs: number, reducedMotion: boolean): void {
    if (!this.available.has(layout)) throw new Error(`layout ${layout} is not available`);
    const durationMs = layout === "compact" || this.targetLayout === "compact"
      ? COMPACT_TRANSITION_MS
      : LAYOUT_TRANSITION_MS;
    this.targetLayout = layout;
    this.transition.retarget(
      this.targets[layout],
      timestampMs,
      durationMs,
      reducedMotion,
    );
    if (!this.transition.active) this.layout = layout;
  }

  sample(timestampMs: number): Float64Array {
    const values = this.transition.sample(timestampMs);
    if (!this.transition.active) this.layout = this.targetLayout;
    return values;
  }

  target(layout: KnowledgeLayoutName): Float64Array {
    if (!this.available.has(layout)) throw new Error(`layout ${layout} is not available`);
    return this.targets[layout];
  }
}

function flattenPositions(positions: readonly KnowledgeSpacePosition[]): Float64Array {
  const values = new Float64Array(positions.length * 3);
  positions.forEach((position, index) => {
    values[index * 3] = position.x;
    values[index * 3 + 1] = position.y;
    values[index * 3 + 2] = position.z;
  });
  return values;
}

function cubicEaseInOut(value: number): number {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}
