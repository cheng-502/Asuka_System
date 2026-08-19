import type { NormalizedLandmark } from "./HandFrame";

export interface PinchConfig {
  enterRatio: number;
  releaseRatio: number;
  activationMs: number;
  cooldownMs: number;
  palmEpsilon: number;
}

export interface PinchState {
  active: boolean;
  activated: boolean;
  released: boolean;
  ratio: number | null;
}

export class PinchStateMachine {
  private readonly config: PinchConfig;
  private active = false;
  private awaitingRelease = false;
  private candidateSince: number | null = null;
  private cooldownUntil = Number.NEGATIVE_INFINITY;
  private previousTimestamp: number | null = null;

  constructor(config: PinchConfig) {
    this.config = config;
  }

  update(timestamp: number, landmarks: readonly NormalizedLandmark[] | null): PinchState {
    if (!Number.isFinite(timestamp)) return this.cancelInvalidTimestamp();
    if (this.previousTimestamp !== null && timestamp < this.previousTimestamp) {
      const cancellation = this.cancel(timestamp);
      this.previousTimestamp = timestamp;
      return cancellation;
    }
    this.previousTimestamp = timestamp;

    if (!landmarks || landmarks.length < 21) return this.cancel(timestamp);
    const ratio = normalizedPinchRatio(landmarks, this.config.palmEpsilon);

    if (this.awaitingRelease) {
      if (ratio >= this.config.releaseRatio) {
        this.awaitingRelease = false;
        this.cooldownUntil = timestamp + this.config.cooldownMs;
      }
      return { active: false, activated: false, released: false, ratio };
    }

    if (this.active) {
      if (ratio >= this.config.releaseRatio) {
        this.active = false;
        this.cooldownUntil = timestamp + this.config.cooldownMs;
        return { active: false, activated: false, released: true, ratio };
      }
      return { active: true, activated: false, released: false, ratio };
    }

    if (timestamp < this.cooldownUntil) {
      this.candidateSince = null;
      return { active: false, activated: false, released: false, ratio };
    }

    if (ratio <= this.config.enterRatio) {
      this.candidateSince ??= timestamp;
      if (timestamp - this.candidateSince >= this.config.activationMs) {
        this.active = true;
        this.candidateSince = null;
        return { active: true, activated: true, released: false, ratio };
      }
    } else {
      this.candidateSince = null;
    }
    return { active: false, activated: false, released: false, ratio };
  }

  reset(): void {
    this.active = false;
    this.awaitingRelease = false;
    this.candidateSince = null;
    this.cooldownUntil = Number.NEGATIVE_INFINITY;
    this.previousTimestamp = null;
  }

  private cancel(timestamp: number): PinchState {
    const released = this.active;
    const hadCandidate = this.candidateSince !== null;
    this.active = false;
    if (released) this.awaitingRelease = true;
    this.candidateSince = null;
    if (released || hadCandidate) this.cooldownUntil = timestamp + this.config.cooldownMs;
    return { active: false, activated: false, released, ratio: null };
  }

  private cancelInvalidTimestamp(): PinchState {
    const released = this.active;
    this.active = false;
    if (released) this.awaitingRelease = true;
    this.candidateSince = null;
    this.previousTimestamp = null;
    return { active: false, activated: false, released, ratio: null };
  }
}

export function normalizedPinchRatio(
  landmarks: readonly NormalizedLandmark[],
  palmEpsilon: number,
): number {
  const palmScale = Math.max(distance(landmarks[0], landmarks[9]), palmEpsilon);
  return distance(landmarks[4], landmarks[8]) / palmScale;
}

function distance(left: NormalizedLandmark, right: NormalizedLandmark): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
