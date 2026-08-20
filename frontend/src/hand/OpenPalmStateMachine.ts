export interface OpenPalmLandmark {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
}

export interface OpenPalmConfig {
  readonly activationMs: number;
  readonly cooldownMs: number;
  readonly dropoutGraceMs: number;
  readonly jointCosineThreshold: number;
  readonly tipExtensionRatio: number;
  readonly palmEpsilon: number;
}

export interface OpenPalmUpdate {
  readonly activated: boolean;
  readonly active: boolean;
}

type Phase = "idle" | "candidate" | "active" | "cooldown";

const FINGER_CHAINS = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
] as const;

export function isOpenPalm(
  landmarks: readonly OpenPalmLandmark[],
  config: OpenPalmConfig,
): boolean {
  if (!hasValidLandmarks(landmarks)) return false;
  const palmScale = distance(landmarks[0], landmarks[9]);
  if (palmScale < config.palmEpsilon) return false;

  return FINGER_CHAINS.every(([mcp, pip, dip, tip]) => {
    const proximalStraightness = cosine(
      subtract(landmarks[pip], landmarks[mcp]),
      subtract(landmarks[dip], landmarks[pip]),
      config.palmEpsilon,
    );
    const distalStraightness = cosine(
      subtract(landmarks[dip], landmarks[pip]),
      subtract(landmarks[tip], landmarks[dip]),
      config.palmEpsilon,
    );
    const tipProgress = distance(landmarks[0], landmarks[tip])
      - distance(landmarks[0], landmarks[pip]);
    return proximalStraightness >= config.jointCosineThreshold
      && distalStraightness >= config.jointCosineThreshold
      && tipProgress >= config.tipExtensionRatio * palmScale;
  });
}

export class OpenPalmStateMachine {
  private phase: Phase = "idle";
  private candidateSince: number | null = null;
  private cooldownUntil: number | null = null;
  private dropoutSince: number | null = null;
  private previousTimestamp: number | null = null;
  private awaitingNeutral = false;

  constructor(private readonly config: OpenPalmConfig) {}

  update(
    timestampMs: number,
    landmarks: readonly OpenPalmLandmark[] | null,
  ): OpenPalmUpdate {
    if (!Number.isFinite(timestampMs)
      || (this.previousTimestamp !== null && timestampMs < this.previousTimestamp)) {
      return this.handleTimeAnomaly();
    }
    this.previousTimestamp = timestampMs;

    if (!landmarks || !hasValidLandmarks(landmarks)) {
      return this.handleDropout(timestampMs);
    }

    this.resumeAfterDropout(timestampMs);
    const open = isOpenPalm(landmarks, this.config);

    if (this.awaitingNeutral) {
      if (!open) {
        this.awaitingNeutral = false;
        this.phase = "cooldown";
        this.cooldownUntil = timestampMs + this.config.cooldownMs;
      }
      return inactive();
    }

    if (!open) return this.handleRelease(timestampMs);
    if (this.phase === "active") return { activated: false, active: true };
    if (this.phase === "cooldown") {
      if (this.cooldownUntil !== null && timestampMs < this.cooldownUntil) return inactive();
      this.phase = "idle";
      this.cooldownUntil = null;
    }
    if (this.phase === "idle") {
      this.phase = "candidate";
      this.candidateSince = timestampMs;
    }
    if (this.candidateSince !== null
      && timestampMs - this.candidateSince >= this.config.activationMs) {
      this.phase = "active";
      this.candidateSince = null;
      return { activated: true, active: true };
    }
    return inactive();
  }

  reset(): void {
    this.phase = "idle";
    this.candidateSince = null;
    this.cooldownUntil = null;
    this.dropoutSince = null;
    this.previousTimestamp = null;
    this.awaitingNeutral = false;
  }

  interruptCandidate(): void {
    if (this.phase !== "candidate") return;
    this.phase = "idle";
    this.candidateSince = null;
    this.dropoutSince = null;
  }

  private handleDropout(timestampMs: number): OpenPalmUpdate {
    if (this.dropoutSince === null) this.dropoutSince = timestampMs;
    if (timestampMs - this.dropoutSince >= this.config.dropoutGraceMs) {
      this.phase = "idle";
      this.candidateSince = null;
      this.cooldownUntil = null;
      this.awaitingNeutral = false;
      return inactive();
    }
    return { activated: false, active: this.phase === "active" };
  }

  private resumeAfterDropout(timestampMs: number): void {
    if (this.dropoutSince === null) return;
    const dropoutDuration = timestampMs - this.dropoutSince;
    if (dropoutDuration < this.config.dropoutGraceMs && this.candidateSince !== null) {
      this.candidateSince += dropoutDuration;
    }
    this.dropoutSince = null;
  }

  private handleRelease(timestampMs: number): OpenPalmUpdate {
    this.candidateSince = null;
    if (this.phase === "active") {
      this.phase = "cooldown";
      this.cooldownUntil = timestampMs + this.config.cooldownMs;
    } else if (this.phase === "candidate") {
      this.phase = "idle";
    } else if (this.phase === "cooldown"
      && this.cooldownUntil !== null
      && timestampMs >= this.cooldownUntil) {
      this.phase = "idle";
      this.cooldownUntil = null;
    }
    return inactive();
  }

  private handleTimeAnomaly(): OpenPalmUpdate {
    this.awaitingNeutral = this.phase === "active";
    this.phase = "idle";
    this.candidateSince = null;
    this.cooldownUntil = null;
    this.dropoutSince = null;
    this.previousTimestamp = null;
    return inactive();
  }
}

function hasValidLandmarks(
  landmarks: readonly OpenPalmLandmark[],
): landmarks is readonly OpenPalmLandmark[] {
  return landmarks.length >= 21 && landmarks.every((point) =>
    Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && (point.z === undefined || Number.isFinite(point.z))
  );
}

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

function subtract(end: OpenPalmLandmark, start: OpenPalmLandmark): Vector3 {
  return {
    x: end.x - start.x,
    y: end.y - start.y,
    z: (end.z ?? 0) - (start.z ?? 0),
  };
}

function cosine(left: Vector3, right: Vector3, epsilon: number): number {
  const leftMagnitude = magnitude(left);
  const rightMagnitude = magnitude(right);
  if (leftMagnitude < epsilon || rightMagnitude < epsilon) {
    return Number.NEGATIVE_INFINITY;
  }
  const denominator = leftMagnitude * rightMagnitude;
  return (left.x * right.x + left.y * right.y + left.z * right.z) / denominator;
}

function magnitude(vector: Vector3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function distance(left: OpenPalmLandmark, right: OpenPalmLandmark): number {
  return magnitude(subtract(left, right));
}

function inactive(): OpenPalmUpdate {
  return { activated: false, active: false };
}
