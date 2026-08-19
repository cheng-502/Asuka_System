import type { NormalizedLandmark } from "./HandFrame";
import { PointerFilter, type PointerViewport } from "./PointerFilter";
import { PinchStateMachine } from "./PinchStateMachine";

export type HandLandmark = NormalizedLandmark;

export type HandLandmarks = readonly HandLandmark[];
export type GestureInput = HandLandmarks | readonly HandLandmarks[] | null;

export type GestureEvent =
  | { type: "pointer"; x: number; y: number }
  | { type: "pinch"; x: number; y: number }
  | { type: "pinch_state"; active: boolean }
  | { type: "open_palm" }
  | { type: "no_hand" }
  | { type: "auto_exit" }
  | { type: "zoom"; delta: number }
  | { type: "rotate"; delta: number };

export interface GestureConfig {
  pointerMinCutoff: number;
  pointerBeta: number;
  pointerDerivativeCutoff: number;
  pointerDeadzonePx: number;
  pinchEnterRatio: number;
  pinchReleaseRatio: number;
  pinchActivationMs: number;
  pinchCooldownMs: number;
  pinchPalmEpsilon: number;
  openPalmStableFrames: number;
  noHandTimeoutFrames: number;
  autoExitTimeoutMs: number;
  twoHandChangeThreshold: number;
  twoHandRotationThreshold: number;
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  pointerMinCutoff: 1,
  pointerBeta: 0.007,
  pointerDerivativeCutoff: 1,
  pointerDeadzonePx: 4,
  pinchEnterRatio: 0.32,
  pinchReleaseRatio: 0.48,
  pinchActivationMs: 120,
  pinchCooldownMs: 150,
  pinchPalmEpsilon: 0.01,
  openPalmStableFrames: 3,
  noHandTimeoutFrames: 8,
  autoExitTimeoutMs: 15_000,
  twoHandChangeThreshold: 0.01,
  twoHandRotationThreshold: 0.04,
};

export class GestureEngine {
  private readonly config: GestureConfig;
  private readonly pointerFilter: PointerFilter;
  private readonly pinchStateMachine: PinchStateMachine;
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
    this.pointerFilter = new PointerFilter({
      minCutoff: this.config.pointerMinCutoff,
      beta: this.config.pointerBeta,
      derivativeCutoff: this.config.pointerDerivativeCutoff,
      deadzonePx: this.config.pointerDeadzonePx,
    });
    this.pinchStateMachine = new PinchStateMachine({
      enterRatio: this.config.pinchEnterRatio,
      releaseRatio: this.config.pinchReleaseRatio,
      activationMs: this.config.pinchActivationMs,
      cooldownMs: this.config.pinchCooldownMs,
      palmEpsilon: this.config.pinchPalmEpsilon,
    });
  }

  update(
    input: GestureInput,
    timestamp = performance.now(),
    viewport: PointerViewport = { width: 1920, height: 1080 },
  ): GestureEvent[] {
    const hands = normalizeHands(input);
    if (!hands.length) return this.handleNoHand(timestamp);
    this.noHandFrames = 0;
    this.noHandActive = false;
    this.noHandSince = null;
    this.autoExitActive = false;
    if (hands.length >= 2) {
      const cancellation = this.pinchStateMachine.update(timestamp, null);
      const cancellationEvents: GestureEvent[] = cancellation.released
        ? [{ type: "pinch_state", active: false }]
        : [];
      if (isOpenPalm(hands[0]) && isOpenPalm(hands[1])) {
        const orderedHands = [...hands].sort((left, right) => left[8].x - right[8].x);
        return [...cancellationEvents, ...this.handleTwoHands(orderedHands[0], orderedHands[1])];
      }
      this.resetTwoHandBaseline();
      return cancellationEvents;
    }
    this.resetTwoHandBaseline();
    return this.handleSingleHand(hands[0], timestamp, viewport);
  }

  private handleSingleHand(
    landmarks: HandLandmarks,
    timestamp: number,
    viewport: PointerViewport,
  ): GestureEvent[] {
    const pointer = this.pointerFilter.update(
      timestamp,
      { x: clamp01(landmarks[8].x), y: clamp01(landmarks[8].y) },
      viewport,
    );
    const events: GestureEvent[] = [{ type: "pointer", ...pointer }];
    const pinch = this.pinchStateMachine.update(timestamp, landmarks);
    const openPalm = !pinch.active && isOpenPalm(landmarks);
    if (pinch.activated) events.push({ type: "pinch_state", active: true }, { type: "pinch", ...pointer });
    if (pinch.released) events.push({ type: "pinch_state", active: false });

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
    this.pointerFilter.reset();
    this.pinchStateMachine.reset();
    this.openPalmFrames = 0;
    this.openPalmActive = false;
    this.noHandFrames = 0;
    this.noHandActive = false;
    this.noHandSince = null;
    this.autoExitActive = false;
    this.resetTwoHandBaseline();
  }

  private handleNoHand(timestamp = performance.now()): GestureEvent[] {
    if (this.noHandSince === null) this.noHandSince = timestamp;
    const pinch = this.pinchStateMachine.update(timestamp, null);
    this.openPalmFrames = 0;
    this.openPalmActive = false;
    this.resetTwoHandBaseline();
    this.noHandFrames += 1;
    const events: GestureEvent[] = pinch.released ? [{ type: "pinch_state", active: false }] : [];
    if (!this.noHandActive && this.noHandFrames >= this.config.noHandTimeoutFrames) {
      this.noHandActive = true;
      this.pointerFilter.reset();
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
