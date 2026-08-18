export interface HandLandmark {
  x: number;
  y: number;
  z?: number;
}

export type HandLandmarks = readonly HandLandmark[];
export type GestureInput = HandLandmarks | readonly HandLandmarks[] | null;

export type GestureEvent =
  | { type: "pointer"; x: number; y: number }
  | { type: "pinch"; x: number; y: number }
  | { type: "open_palm" }
  | { type: "no_hand" }
  | { type: "auto_exit" }
  | { type: "zoom"; delta: number }
  | { type: "rotate"; delta: number };

export interface GestureConfig {
  pointerSmoothing: number;
  pinchDistance: number;
  pinchStableFrames: number;
  openPalmStableFrames: number;
  noHandTimeoutFrames: number;
  autoExitTimeoutMs: number;
  twoHandChangeThreshold: number;
  twoHandRotationThreshold: number;
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  pointerSmoothing: 0.35,
  pinchDistance: 0.08,
  pinchStableFrames: 3,
  openPalmStableFrames: 3,
  noHandTimeoutFrames: 8,
  autoExitTimeoutMs: 15_000,
  twoHandChangeThreshold: 0.01,
  twoHandRotationThreshold: 0.04,
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
  private noHandSince: number | null = null;
  private autoExitActive = false;
  private previousTwoHandDistance: number | null = null;
  private previousTwoHandAngle: number | null = null;

  constructor(config: Partial<GestureConfig> = {}) {
    this.config = { ...DEFAULT_GESTURE_CONFIG, ...config };
  }

  update(input: GestureInput, timestamp = performance.now()): GestureEvent[] {
    const hands = normalizeHands(input);
    if (!hands.length) return this.handleNoHand(timestamp);
    this.noHandFrames = 0;
    this.noHandActive = false;
    this.noHandSince = null;
    this.autoExitActive = false;
    if (hands.length >= 2 && isOpenPalm(hands[0]) && isOpenPalm(hands[1])) {
      const orderedHands = [...hands].sort((left, right) => left[8].x - right[8].x);
      return this.handleTwoHands(orderedHands[0], orderedHands[1]);
    }
    this.resetTwoHandBaseline();
    return this.handleSingleHand(hands[0]);
  }

  private handleSingleHand(landmarks: HandLandmarks): GestureEvent[] {
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
    this.noHandSince = null;
    this.autoExitActive = false;
    this.resetTwoHandBaseline();
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

  private handleNoHand(timestamp = performance.now()): GestureEvent[] {
    if (this.noHandSince === null) this.noHandSince = timestamp;
    this.pinchFrames = 0;
    this.pinchActive = false;
    this.openPalmFrames = 0;
    this.openPalmActive = false;
    this.resetTwoHandBaseline();
    this.noHandFrames += 1;
    const events: GestureEvent[] = [];
    if (!this.noHandActive && this.noHandFrames >= this.config.noHandTimeoutFrames) {
      this.noHandActive = true;
      events.push({ type: "no_hand" });
    }
    if (
      !this.autoExitActive &&
      this.noHandSince !== null &&
      timestamp - this.noHandSince >= this.config.autoExitTimeoutMs
    ) {
      this.autoExitActive = true;
      events.push({ type: "auto_exit" });
    }
    return events;
  }

  private handleTwoHands(left: HandLandmarks, right: HandLandmarks): GestureEvent[] {
    const leftIndex = left[8];
    const rightIndex = right[8];
    const currentDistance = distance(leftIndex, rightIndex);
    const currentAngle = Math.atan2(rightIndex.y - leftIndex.y, rightIndex.x - leftIndex.x);
    const events: GestureEvent[] = [];

    if (this.previousTwoHandDistance !== null) {
      const distanceDelta = currentDistance - this.previousTwoHandDistance;
      if (Math.abs(distanceDelta) >= this.config.twoHandChangeThreshold) {
        events.push({ type: "zoom", delta: distanceDelta });
      }
    }
    if (this.previousTwoHandAngle !== null) {
      const angleDelta = shortestAngleDelta(currentAngle, this.previousTwoHandAngle);
      if (Math.abs(angleDelta) >= this.config.twoHandRotationThreshold) {
        events.push({ type: "rotate", delta: angleDelta });
      }
    }
    this.previousTwoHandDistance = currentDistance;
    this.previousTwoHandAngle = currentAngle;
    return events;
  }

  private resetTwoHandBaseline(): void {
    this.previousTwoHandDistance = null;
    this.previousTwoHandAngle = null;
  }
}

function distance(left: HandLandmark, right: HandLandmark): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function isOpenPalm(landmarks: readonly HandLandmark[]): boolean {
  const fingerPairs: Array<[number, number]> = [[8, 6], [12, 10], [16, 14], [20, 18]];
  return fingerPairs.filter(([tip, pip]) => landmarks[tip].y < landmarks[pip].y).length >= 4;
}

function normalizeHands(input: GestureInput): HandLandmarks[] {
  if (!input || input.length === 0) return [];
  if (Array.isArray(input[0])) {
    return (input as readonly HandLandmarks[])
      .filter((hand) => hand.length >= 21)
      .slice(0, 2)
      .map((hand) => [...hand]);
  }
  const singleHand = input as HandLandmarks;
  return singleHand.length >= 21 ? [[...singleHand]] : [];
}

function shortestAngleDelta(current: number, previous: number): number {
  let delta = current - previous;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
