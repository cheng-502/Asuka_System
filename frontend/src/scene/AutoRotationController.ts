export const AUTO_ROTATION_SPEED_RAD_PER_SECOND = 0.035;
export const AUTO_ROTATION_RESUME_DELAY_MS = 2_000;

const MAX_FRAME_GAP_MS = 1_000;

export interface AutoRotationConditions {
  compactTransitionComplete: boolean;
  mouseDragging: boolean;
  wheelActive: boolean;
  handActive: boolean;
  selectionActive: boolean;
  hidden: boolean;
  reducedMotion: boolean;
}

export type AutoRotationBlocker =
  | "compactTransitionComplete"
  | "mouseDragging"
  | "wheelActive"
  | "handActive"
  | "selectionActive"
  | "hidden"
  | "reducedMotion";

export type AutoRotationPhase = "paused" | "waiting" | "running";

export interface AutoRotationSnapshot {
  readonly angleDeltaRad: number;
  readonly phase: AutoRotationPhase;
  readonly blockers: readonly AutoRotationBlocker[];
  readonly resumeAtMs: number | null;
}

export class AutoRotationController {
  private eligibleSinceMs: number | null = null;
  private lastTimestampMs: number | null = null;
  private phase: AutoRotationPhase = "paused";

  update(timestampMs: number, conditions: Readonly<AutoRotationConditions>): AutoRotationSnapshot {
    const timestamp = Number.isFinite(timestampMs) ? timestampMs : 0;
    const blockers = blockersFor(conditions);

    if (blockers.length > 0) {
      this.eligibleSinceMs = null;
      this.lastTimestampMs = timestamp;
      this.phase = "paused";
      return snapshot(0, this.phase, blockers, null);
    }

    if (this.lastTimestampMs !== null && timestamp < this.lastTimestampMs) {
      if (this.phase !== "running") {
        this.eligibleSinceMs = timestamp;
        this.lastTimestampMs = timestamp;
      }
      return snapshot(
        0,
        this.phase,
        [],
        this.phase === "waiting" ? timestamp + AUTO_ROTATION_RESUME_DELAY_MS : null,
      );
    }

    if (this.eligibleSinceMs === null) {
      this.eligibleSinceMs = timestamp;
      this.lastTimestampMs = timestamp;
      this.phase = "waiting";
      return snapshot(0, this.phase, [], timestamp + AUTO_ROTATION_RESUME_DELAY_MS);
    }

    const resumeAtMs = this.eligibleSinceMs + AUTO_ROTATION_RESUME_DELAY_MS;
    if (timestamp < resumeAtMs) {
      this.lastTimestampMs = timestamp;
      this.phase = "waiting";
      return snapshot(0, this.phase, [], resumeAtMs);
    }

    if (this.phase !== "running") {
      this.phase = "running";
      this.lastTimestampMs = timestamp;
      return snapshot(0, this.phase, [], null);
    }

    const elapsedMs = timestamp - (this.lastTimestampMs ?? timestamp);
    this.lastTimestampMs = timestamp;
    const angleDeltaRad = elapsedMs < 0 || elapsedMs > MAX_FRAME_GAP_MS
      ? 0
      : AUTO_ROTATION_SPEED_RAD_PER_SECOND * (elapsedMs / 1_000);

    return snapshot(angleDeltaRad, this.phase, [], null);
  }
}

function blockersFor(conditions: Readonly<AutoRotationConditions>): AutoRotationBlocker[] {
  const blockers: AutoRotationBlocker[] = [];
  if (!conditions.compactTransitionComplete) blockers.push("compactTransitionComplete");
  if (conditions.mouseDragging) blockers.push("mouseDragging");
  if (conditions.wheelActive) blockers.push("wheelActive");
  if (conditions.handActive) blockers.push("handActive");
  if (conditions.selectionActive) blockers.push("selectionActive");
  if (conditions.hidden) blockers.push("hidden");
  if (conditions.reducedMotion) blockers.push("reducedMotion");
  return blockers;
}

function snapshot(
  angleDeltaRad: number,
  phase: AutoRotationPhase,
  blockers: AutoRotationBlocker[],
  resumeAtMs: number | null,
): AutoRotationSnapshot {
  return Object.freeze({
    angleDeltaRad,
    phase,
    blockers: Object.freeze(blockers),
    resumeAtMs,
  });
}
