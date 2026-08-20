import type {
  HandFrame,
  NormalizedLandmark,
  TrackedHand,
} from "./HandFrame";
import {
  isOpenPalm,
  OpenPalmStateMachine,
} from "./OpenPalmStateMachine";
import { PinchStateMachine } from "./PinchStateMachine";
import { PointerFilter, type PointerViewport } from "./PointerFilter";
import {
  TwoHandTransformStateMachine,
  type TwoHandTransformEvent,
} from "./TwoHandTransformStateMachine";

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
  | TwoHandTransformEvent;

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
  trackingDropoutGraceMs: number;
  autoExitTimeoutMs: number;
  openPalmActivationMs: number;
  openPalmCooldownMs: number;
  twoHandActivationMs: number;
  twoHandZoomDeadzoneRatio: number;
  twoHandRotationDeadzoneDegrees: number;
  twoHandMaxZoomRatePerSecond: number;
  twoHandMaxRotationRateDegreesPerSecond: number;
  twoHandDropoutGraceMs: number;
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
  trackingDropoutGraceMs: 150,
  autoExitTimeoutMs: 15_000,
  openPalmActivationMs: 250,
  openPalmCooldownMs: 500,
  twoHandActivationMs: 200,
  twoHandZoomDeadzoneRatio: 0.03,
  twoHandRotationDeadzoneDegrees: 3,
  twoHandMaxZoomRatePerSecond: 1,
  twoHandMaxRotationRateDegreesPerSecond: 120,
  twoHandDropoutGraceMs: 150,
};

const OPEN_PALM_JOINT_COSINE_THRESHOLD = 0.5;
const OPEN_PALM_TIP_EXTENSION_RATIO = 0.1;

export class GestureEngine {
  private readonly config: GestureConfig;
  private readonly pointerFilter: PointerFilter;
  private readonly pinchStateMachine: PinchStateMachine;
  private readonly openPalmStateMachine: OpenPalmStateMachine;
  private twoHandStateMachine: TwoHandTransformStateMachine;
  private twoHandOwnsInput = false;
  private noHandSince: number | null = null;
  private noHandActive = false;
  private autoExitActive = false;

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
    this.openPalmStateMachine = new OpenPalmStateMachine({
      activationMs: this.config.openPalmActivationMs,
      cooldownMs: this.config.openPalmCooldownMs,
      dropoutGraceMs: this.config.trackingDropoutGraceMs,
      jointCosineThreshold: OPEN_PALM_JOINT_COSINE_THRESHOLD,
      tipExtensionRatio: OPEN_PALM_TIP_EXTENSION_RATIO,
      palmEpsilon: this.config.pinchPalmEpsilon,
    });
    this.twoHandStateMachine = this.createTwoHandStateMachine();
  }

  /** Compatibility adapter for tests and callers that already provide interaction-space landmarks. */
  update(
    input: GestureInput,
    timestampMs = performance.now(),
    viewport: PointerViewport = { width: 1920, height: 1080 },
  ): GestureEvent[] {
    const hands = normalizeHands(input).map((landmarks): TrackedHand => ({
      landmarks: [...landmarks],
      handedness: "Unknown",
      handednessConfidence: 1,
    }));
    return this.updateFrame({
      timestampMs,
      frameWidth: viewport.width,
      frameHeight: viewport.height,
      hands,
    }, viewport);
  }

  updateFrame(
    frame: HandFrame,
    viewport: PointerViewport = { width: 1920, height: 1080 },
  ): GestureEvent[] {
    if (!isValidFrameMetadata(frame)) {
      if (Number.isFinite(frame.timestampMs)) return this.handleNoHand(frame.timestampMs);
      this.pinchStateMachine.update(frame.timestampMs, null);
      this.openPalmStateMachine.update(frame.timestampMs, null);
      const twoHandEvents = this.twoHandStateMachine.update(frame.timestampMs, null, false);
      this.updateTwoHandOwnership(twoHandEvents);
      return twoHandEvents;
    }
    const hands = frame.hands
      .filter(isValidTrackedHand)
      .slice(0, 2);

    if (hands.length === 0) return this.handleNoHand(frame.timestampMs);
    this.resetNoHandTracking();

    if (hands.length === 2) return this.handleTwoHands(hands, frame.timestampMs);

    const twoHandEvents = this.twoHandStateMachine.update(frame.timestampMs, null, false);
    if (this.twoHandOwnsInput || twoHandEvents.length > 0) {
      this.updateTwoHandOwnership(twoHandEvents);
      this.cancelSingleHandModes(frame.timestampMs);
      return twoHandEvents;
    }
    return this.handleSingleHand(hands[0].landmarks, frame.timestampMs, viewport);
  }

  reset(): void {
    this.pointerFilter.reset();
    this.pinchStateMachine.reset();
    this.openPalmStateMachine.reset();
    this.twoHandStateMachine = this.createTwoHandStateMachine();
    this.twoHandOwnsInput = false;
    this.noHandSince = null;
    this.noHandActive = false;
    this.autoExitActive = false;
  }

  private handleSingleHand(
    landmarks: HandLandmarks,
    timestampMs: number,
    viewport: PointerViewport,
  ): GestureEvent[] {
    const pointer = this.pointerFilter.update(
      timestampMs,
      { x: clamp01(landmarks[8].x), y: clamp01(landmarks[8].y) },
      viewport,
    );
    const pinch = this.pinchStateMachine.update(timestampMs, landmarks);
    const pinchHasPriority = pinch.active
      || pinch.activated
      || (pinch.ratio !== null && pinch.ratio <= this.config.pinchEnterRatio);
    const events: GestureEvent[] = [];

    if (pinch.activated) {
      events.push({ type: "pinch_state", active: true }, { type: "pinch", ...pointer });
    }
    if (pinch.released) events.push({ type: "pinch_state", active: false });
    if (pinchHasPriority) {
      this.openPalmStateMachine.interruptCandidate();
      return events;
    }

    const palm = this.openPalmStateMachine.update(timestampMs, landmarks);
    if (palm.activated) events.push({ type: "open_palm" });
    if (isOpenPalm(landmarks, this.openPalmConfig())) return events;

    events.push({ type: "pointer", ...pointer });
    return events;
  }

  private handleTwoHands(hands: readonly TrackedHand[], timestampMs: number): GestureEvent[] {
    this.pinchStateMachine.update(timestampMs, null);
    this.openPalmStateMachine.interruptCandidate();
    const bothOpenPalms = hands.every((hand) =>
      isOpenPalm(hand.landmarks, this.openPalmConfig()));
    const twoHandEvents = this.twoHandStateMachine.update(
      timestampMs,
      hands.map((hand) => ({
        handedness: hand.handedness,
        landmarks: hand.landmarks,
      })),
      bothOpenPalms,
    );
    this.updateTwoHandOwnership(twoHandEvents);
    return twoHandEvents;
  }

  private handleNoHand(timestampMs: number): GestureEvent[] {
    if (!Number.isFinite(timestampMs)) return [];
    if (this.noHandSince === null || timestampMs < this.noHandSince) {
      this.noHandSince = timestampMs;
      this.noHandActive = false;
      this.autoExitActive = false;
    }

    const events: GestureEvent[] = [];
    const pinch = this.pinchStateMachine.update(timestampMs, null);
    if (pinch.released) events.push({ type: "pinch_state", active: false });
    this.openPalmStateMachine.update(timestampMs, null);
    const twoHandEvents = this.twoHandStateMachine.update(timestampMs, null, false);
    this.updateTwoHandOwnership(twoHandEvents);
    events.push(...twoHandEvents);

    const elapsed = timestampMs - this.noHandSince;
    if (!this.noHandActive && elapsed >= this.config.trackingDropoutGraceMs) {
      this.noHandActive = true;
      this.pointerFilter.reset();
      events.push({ type: "no_hand" });
    }
    if (!this.autoExitActive && elapsed >= this.config.autoExitTimeoutMs) {
      this.autoExitActive = true;
      events.push({ type: "auto_exit" });
    }
    return events;
  }

  private cancelSingleHandModes(timestampMs: number): void {
    this.pinchStateMachine.update(timestampMs, null);
    this.openPalmStateMachine.interruptCandidate();
  }

  private resetNoHandTracking(): void {
    this.noHandSince = null;
    this.noHandActive = false;
    this.autoExitActive = false;
  }

  private updateTwoHandOwnership(events: readonly GestureEvent[]): void {
    if (events.some((event) => event.type === "two_hand_start")) this.twoHandOwnsInput = true;
    if (events.some((event) => event.type === "two_hand_end")) this.twoHandOwnsInput = false;
  }

  private openPalmConfig() {
    return {
      activationMs: this.config.openPalmActivationMs,
      cooldownMs: this.config.openPalmCooldownMs,
      dropoutGraceMs: this.config.trackingDropoutGraceMs,
      jointCosineThreshold: OPEN_PALM_JOINT_COSINE_THRESHOLD,
      tipExtensionRatio: OPEN_PALM_TIP_EXTENSION_RATIO,
      palmEpsilon: this.config.pinchPalmEpsilon,
    };
  }

  private createTwoHandStateMachine(): TwoHandTransformStateMachine {
    return new TwoHandTransformStateMachine({
      activationMs: this.config.twoHandActivationMs,
      zoomDeadzoneRatio: this.config.twoHandZoomDeadzoneRatio,
      rotationDeadzoneDegrees: this.config.twoHandRotationDeadzoneDegrees,
      maxZoomRatePerSecond: this.config.twoHandMaxZoomRatePerSecond,
      maxRotationRateDegreesPerSecond: this.config.twoHandMaxRotationRateDegreesPerSecond,
      dropoutGraceMs: this.config.twoHandDropoutGraceMs,
    });
  }
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isValidFrameMetadata(frame: HandFrame): boolean {
  return Number.isFinite(frame.timestampMs)
    && frame.timestampMs >= 0
    && Number.isFinite(frame.frameWidth)
    && frame.frameWidth > 0
    && Number.isFinite(frame.frameHeight)
    && frame.frameHeight > 0;
}

function isValidTrackedHand(hand: TrackedHand): boolean {
  return hand.landmarks.length === 21
    && hand.landmarks.every((landmark) => Number.isFinite(landmark.x)
      && Number.isFinite(landmark.y)
      && (landmark.z === undefined || Number.isFinite(landmark.z)));
}
