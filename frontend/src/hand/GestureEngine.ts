export interface HandLandmark {
  x: number;
  y: number;
  z?: number;
}

export type GestureEvent =
  | { type: "pointer"; x: number; y: number }
  | { type: "pinch"; x: number; y: number }
  | { type: "open_palm" }
  | { type: "no_hand" };

export interface GestureConfig {
  pointerSmoothing: number;
  pinchDistance: number;
  pinchStableFrames: number;
  openPalmStableFrames: number;
  noHandTimeoutFrames: number;
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  pointerSmoothing: 0.35,
  pinchDistance: 0.08,
  pinchStableFrames: 3,
  openPalmStableFrames: 3,
  noHandTimeoutFrames: 8,
};

export class GestureEngine {
  private readonly config: GestureConfig;
  private smoothedPointer: { x: number; y: number } | null = null;
  private pinchFrames = 0;
  private pinchActive = false;
  private openPalmFrames = 0;
  private openPalmActive = false;
  private noHandFrames = 0;
  private noHandActive = false;

  constructor(config: Partial<GestureConfig> = {}) {
    this.config = { ...DEFAULT_GESTURE_CONFIG, ...config };
  }

  update(landmarks: readonly HandLandmark[] | null): GestureEvent[] {
    if (!landmarks || landmarks.length < 21) return this.handleNoHand();
    this.noHandFrames = 0;
    this.noHandActive = false;
    const pointer = this.smoothPointer(landmarks[8]);
    const events: GestureEvent[] = [{ type: "pointer", ...pointer }];
    const pinching = distance(landmarks[4], landmarks[8]) <= this.config.pinchDistance;
    const openPalm = !pinching && isOpenPalm(landmarks);

    if (pinching) {
      this.pinchFrames += 1;
      this.openPalmFrames = 0;
      this.openPalmActive = false;
      if (!this.pinchActive && this.pinchFrames >= this.config.pinchStableFrames) {
        this.pinchActive = true;
        events.push({ type: "pinch", ...pointer });
      }
    } else {
      this.pinchFrames = 0;
      this.pinchActive = false;
    }

    if (openPalm) {
      this.openPalmFrames += 1;
      if (!this.openPalmActive && this.openPalmFrames >= this.config.openPalmStableFrames) {
        this.openPalmActive = true;
        events.push({ type: "open_palm" });
      }
    } else {
      this.openPalmFrames = 0;
      this.openPalmActive = false;
    }
    return events;
  }

  reset(): void {
    this.smoothedPointer = null;
    this.pinchFrames = 0;
    this.pinchActive = false;
    this.openPalmFrames = 0;
    this.openPalmActive = false;
    this.noHandFrames = 0;
    this.noHandActive = false;
  }

  private smoothPointer(indexTip: HandLandmark): { x: number; y: number } {
    const raw = { x: clamp01(indexTip.x), y: clamp01(indexTip.y) };
    if (!this.smoothedPointer) {
      this.smoothedPointer = raw;
      return raw;
    }
    const alpha = this.config.pointerSmoothing;
    this.smoothedPointer = {
      x: this.smoothedPointer.x + (raw.x - this.smoothedPointer.x) * alpha,
      y: this.smoothedPointer.y + (raw.y - this.smoothedPointer.y) * alpha,
    };
    return this.smoothedPointer;
  }

  private handleNoHand(): GestureEvent[] {
    this.pinchFrames = 0;
    this.pinchActive = false;
    this.openPalmFrames = 0;
    this.openPalmActive = false;
    this.noHandFrames += 1;
    if (!this.noHandActive && this.noHandFrames >= this.config.noHandTimeoutFrames) {
      this.noHandActive = true;
      return [{ type: "no_hand" }];
    }
    return [];
  }
}

function distance(left: HandLandmark, right: HandLandmark): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function isOpenPalm(landmarks: readonly HandLandmark[]): boolean {
  const fingerPairs: Array<[number, number]> = [[8, 6], [12, 10], [16, 14], [20, 18]];
  return fingerPairs.filter(([tip, pip]) => landmarks[tip].y < landmarks[pip].y).length >= 4;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
