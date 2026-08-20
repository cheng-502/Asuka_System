export type TwoHandTransformHandedness = "Left" | "Right" | "Unknown";

export interface TwoHandTransformLandmark {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
}

export interface TwoHandTransformHand {
  readonly handedness: TwoHandTransformHandedness;
  readonly landmarks: readonly TwoHandTransformLandmark[];
}

type EndReason = "released" | "dropout" | "ambiguous";

export type TwoHandTransformEvent =
  | { readonly type: "two_hand_start"; readonly timestampMs: number }
  | {
      readonly type: "two_hand_transform";
      readonly timestampMs: number;
      readonly zoomLogDelta: number;
      readonly rotationDeltaRad: number;
    }
  | {
      readonly type: "two_hand_end";
      readonly timestampMs: number;
      readonly reason: EndReason;
    };

export interface TwoHandTransformConfig {
  readonly activationMs: number;
  readonly zoomDeadzoneRatio: number;
  readonly rotationDeadzoneDegrees: number;
  /** Maximum change in log(distance ratio) per second. */
  readonly maxZoomRatePerSecond: number;
  readonly maxRotationRateDegreesPerSecond: number;
  readonly dropoutGraceMs: number;
}

const DEFAULT_CONFIG: TwoHandTransformConfig = {
  activationMs: 200,
  zoomDeadzoneRatio: 0.03,
  rotationDeadzoneDegrees: 3,
  maxZoomRatePerSecond: 1,
  maxRotationRateDegreesPerSecond: 120,
  dropoutGraceMs: 150,
};

type OrderedHands = readonly [TwoHandTransformHand, TwoHandTransformHand];
type SuspensionReason = "dropout" | "ambiguous";
type Measurement = {
  readonly distance: number;
  readonly angle: number;
  readonly vectorX: number;
  readonly vectorY: number;
  readonly palmScale: number;
};

export class TwoHandTransformStateMachine {
  private readonly config: TwoHandTransformConfig;
  private phase: "idle" | "arming" | "active" | "suspended" = "idle";
  private armingSince = 0;
  private suspendedSince = 0;
  private suspensionReason: SuspensionReason = "dropout";
  private baselineDistance = 0;
  private baselineAngle = 0;
  private previousRawAngle = 0;
  private unwrappedAngle = 0;
  private appliedZoom = 0;
  private appliedRotation = 0;
  private lastTimestamp = 0;
  private previousInputTimestamp: number | null = null;
  private previousHands: OrderedHands | null = null;
  private previousVector: readonly [number, number] | null = null;

  constructor(config: Partial<TwoHandTransformConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  update(
    timestampMs: number,
    hands: readonly TwoHandTransformHand[] | null,
    bothOpenPalms: boolean,
  ): TwoHandTransformEvent[] {
    if (!Number.isFinite(timestampMs)) return this.handleTimeAnomaly();
    if (this.previousInputTimestamp !== null && timestampMs < this.previousInputTimestamp) {
      if (this.phase === "active" || this.phase === "suspended") {
        return this.finish(timestampMs, "ambiguous");
      }
      this.reset();
      return [];
    }
    this.previousInputTimestamp = timestampMs;
    if (!hands || hands.length !== 2) return this.handleUnavailable(timestampMs, "dropout");
    if (!bothOpenPalms) return this.release(timestampMs);

    const ordered = resolveIdentity(hands, this.previousHands);
    const measurement = ordered ? measure(ordered) : null;
    if (!ordered || !measurement || !isUsableDistance(measurement)) {
      return this.handleUnavailable(timestampMs, "ambiguous");
    }

    if (this.phase === "suspended") {
      if (timestampMs - this.suspendedSince >= this.config.dropoutGraceMs) {
        return this.finish(timestampMs, this.suspensionReason);
      }
      this.phase = "active";
      this.setBaseline(ordered, measurement, timestampMs);
      return [];
    }

    if (this.phase === "idle") {
      this.phase = "arming";
      this.armingSince = timestampMs;
      this.previousHands = ordered;
      return [];
    }
    if (this.phase === "arming") {
      this.previousHands = ordered;
      if (timestampMs - this.armingSince < this.config.activationMs) return [];
      this.phase = "active";
      this.setBaseline(ordered, measurement, timestampMs);
      return [{ type: "two_hand_start", timestampMs }];
    }

    if (timestampMs < this.lastTimestamp || isCrossing(measurement, this.previousVector)) {
      return this.suspend(timestampMs, "ambiguous");
    }

    const dt = (timestampMs - this.lastTimestamp) / 1_000;
    const zoomTarget = applyContinuousDeadzone(
      Math.log(measurement.distance / this.baselineDistance),
      Math.log1p(this.config.zoomDeadzoneRatio),
    );
    const angleStep = wrapAngle(measurement.angle - this.previousRawAngle);
    this.unwrappedAngle += angleStep;
    const rotationTarget = applyContinuousDeadzone(
      this.unwrappedAngle - this.baselineAngle,
      degreesToRadians(this.config.rotationDeadzoneDegrees),
    );
    const zoomDelta = clampMagnitude(
      zoomTarget - this.appliedZoom,
      Math.log1p(this.config.maxZoomRatePerSecond) * dt,
    );
    const rotationDelta = clampMagnitude(
      rotationTarget - this.appliedRotation,
      degreesToRadians(this.config.maxRotationRateDegreesPerSecond) * dt,
    );

    this.appliedZoom += zoomDelta;
    this.appliedRotation += rotationDelta;
    this.previousRawAngle = measurement.angle;
    this.previousHands = ordered;
    this.previousVector = [measurement.vectorX, measurement.vectorY];
    this.lastTimestamp = timestampMs;

    return nearlyZero(zoomDelta) && nearlyZero(rotationDelta)
      ? []
      : [{
          type: "two_hand_transform",
          timestampMs,
          zoomLogDelta: zoomDelta,
          rotationDeltaRad: rotationDelta,
        }];
  }

  private handleUnavailable(
    timestampMs: number,
    reason: SuspensionReason,
  ): TwoHandTransformEvent[] {
    if (this.phase === "idle") return [];
    if (this.phase === "arming") {
      this.reset();
      return [];
    }
    if (this.phase === "active") return this.suspend(timestampMs, reason);
    if (timestampMs - this.suspendedSince < this.config.dropoutGraceMs) return [];
    return this.finish(timestampMs, this.suspensionReason);
  }

  private suspend(timestampMs: number, reason: SuspensionReason): TwoHandTransformEvent[] {
    this.phase = "suspended";
    this.suspendedSince = timestampMs;
    this.suspensionReason = reason;
    return [];
  }

  private release(timestampMs: number): TwoHandTransformEvent[] {
    if (this.phase === "active" || this.phase === "suspended") {
      return this.finish(timestampMs, "released");
    }
    this.reset();
    return [];
  }

  private handleTimeAnomaly(): TwoHandTransformEvent[] {
    if (this.phase === "active" || this.phase === "suspended") {
      return this.finish(this.lastTimestamp, "ambiguous");
    }
    this.reset();
    return [];
  }

  private finish(timestampMs: number, reason: EndReason): TwoHandTransformEvent[] {
    this.reset();
    return [{ type: "two_hand_end", timestampMs, reason }];
  }

  private setBaseline(
    hands: OrderedHands,
    measurement: Measurement,
    timestampMs: number,
  ): void {
    this.baselineDistance = measurement.distance;
    this.baselineAngle = measurement.angle;
    this.previousRawAngle = measurement.angle;
    this.unwrappedAngle = measurement.angle;
    this.appliedZoom = 0;
    this.appliedRotation = 0;
    this.lastTimestamp = timestampMs;
    this.previousHands = hands;
    this.previousVector = [measurement.vectorX, measurement.vectorY];
  }

  private reset(): void {
    this.phase = "idle";
    this.previousHands = null;
    this.previousVector = null;
    this.previousInputTimestamp = null;
  }
}

function resolveIdentity(
  hands: readonly TwoHandTransformHand[],
  previous: OrderedHands | null,
): OrderedHands | null {
  if (hands.some((hand) => !isValidHand(hand))) return null;
  const left = hands.filter((hand) => hand.handedness === "Left");
  const right = hands.filter((hand) => hand.handedness === "Right");
  if (left.length === 1 && right.length === 1) return [left[0], right[0]];
  if (left.length > 1 || right.length > 1) return null;

  if (!previous) {
    const ordered = [...hands].sort((a, b) => a.landmarks[0].x - b.landmarks[0].x);
    const pair: OrderedHands = [ordered[0], ordered[1]];
    const scale = averagePalmScale(pair);
    return Math.abs(pair[1].landmarks[0].x - pair[0].landmarks[0].x) <= scale * 0.35
      ? null
      : pair;
  }

  const direct = identityCost(previous[0], hands[0]) + identityCost(previous[1], hands[1]);
  const swapped = identityCost(previous[0], hands[1]) + identityCost(previous[1], hands[0]);
  const ambiguityMargin = averagePalmScale(previous) * 0.15;
  if (Math.abs(direct - swapped) <= ambiguityMargin) return null;
  return direct < swapped ? [hands[0], hands[1]] : [hands[1], hands[0]];
}

function isValidHand(hand: TwoHandTransformHand): boolean {
  return hand.landmarks.length >= 21 && [0, 8, 9].every((index) => {
    const landmark = hand.landmarks[index];
    return Number.isFinite(landmark.x) && Number.isFinite(landmark.y);
  });
}

function identityCost(previous: TwoHandTransformHand, current: TwoHandTransformHand): number {
  return pointDistance(previous.landmarks[0], current.landmarks[0])
    + pointDistance(previous.landmarks[8], current.landmarks[8]);
}

function measure(hands: OrderedHands): Measurement | null {
  const left = hands[0].landmarks[8];
  const right = hands[1].landmarks[8];
  const vectorX = right.x - left.x;
  const vectorY = right.y - left.y;
  const distance = Math.hypot(vectorX, vectorY);
  const angle = Math.atan2(vectorY, vectorX);
  const palmScale = averagePalmScale(hands);
  return [distance, angle, vectorX, vectorY, palmScale].every(Number.isFinite)
    ? { distance, angle, vectorX, vectorY, palmScale }
    : null;
}

function isUsableDistance(measurement: Measurement): boolean {
  return measurement.distance > Math.max(1e-6, measurement.palmScale * 0.05);
}

function isCrossing(
  measurement: Measurement,
  previousVector: readonly [number, number] | null,
): boolean {
  if (measurement.distance <= measurement.palmScale * 0.35) return true;
  if (!previousVector) return false;
  return measurement.vectorX * previousVector[0] + measurement.vectorY * previousVector[1] < 0;
}

function averagePalmScale(hands: OrderedHands): number {
  return (
    pointDistance(hands[0].landmarks[0], hands[0].landmarks[9])
    + pointDistance(hands[1].landmarks[0], hands[1].landmarks[9])
  ) / 2;
}

function pointDistance(left: TwoHandTransformLandmark, right: TwoHandTransformLandmark): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function applyContinuousDeadzone(value: number, deadzone: number): number {
  return Math.sign(value) * Math.max(0, Math.abs(value) - deadzone);
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function clampMagnitude(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function nearlyZero(value: number): boolean {
  return Math.abs(value) <= Number.EPSILON;
}
