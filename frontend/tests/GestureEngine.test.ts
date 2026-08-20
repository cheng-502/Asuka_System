import { describe, expect, it } from "vitest";
import { GestureEngine, type HandLandmark } from "../src/hand/GestureEngine";
import type { HandFrame, Handedness, TrackedHand } from "../src/hand/HandFrame";

function landmarks(overrides: Partial<Record<number, Partial<HandLandmark>>> = {}): HandLandmark[] {
  return Array.from({ length: 21 }, (_, index) => ({
    x: 0.2 + index * 0.005, y: 0.7, z: 0, ...overrides[index],
  }));
}

function openPalm(centerX: number): HandLandmark[] {
  const hand = Array.from({ length: 21 }, () => ({ x: centerX, y: 0.8, z: 0 }));
  hand[0] = { x: centerX, y: 0.8, z: 0 };
  hand[4] = { x: centerX + 0.28, y: 0.72, z: 0 };
  const fingers = [
    [5, 6, 7, 8, centerX - 0.12],
    [9, 10, 11, 12, centerX - 0.04],
    [13, 14, 15, 16, centerX + 0.04],
    [17, 18, 19, 20, centerX + 0.12],
  ] as const;
  for (const [mcp, pip, dip, tip, x] of fingers) {
    hand[mcp] = { x, y: 0.62, z: 0 };
    hand[pip] = { x, y: 0.48, z: 0 };
    hand[dip] = { x, y: 0.34, z: 0 };
    hand[tip] = { x, y: 0.2, z: 0 };
  }
  return hand;
}

function pinchHand(palmScale: number, pinchRatio: number): HandLandmark[] {
  return landmarks({
    0: { x: 0.5, y: 0.7 }, 9: { x: 0.5, y: 0.7 - palmScale },
    4: { x: 0.5, y: 0.3 }, 8: { x: 0.5 + palmScale * pinchRatio, y: 0.3 },
  });
}

function tracked(points: HandLandmark[], handedness: Handedness = "Unknown"): TrackedHand {
  return { landmarks: points, handedness, handednessConfidence: 0.9 };
}

function frame(timestampMs: number, hands: TrackedHand[]): HandFrame {
  return { timestampMs, frameWidth: 640, frameHeight: 480, hands };
}

function translate(hand: HandLandmark[], deltaX: number, deltaY: number): HandLandmark[] {
  return hand.map((point) => ({ ...point, x: point.x + deltaX, y: point.y + deltaY }));
}

describe("GestureEngine", () => {
  it("keeps the legacy update entry point for single-hand pointer callers", () => {
    const engine = new GestureEngine({ pointerDeadzonePx: 0 });
    expect(engine.update(landmarks({ 8: { x: 0.2, y: 0.2 } }), 0)).toEqual([
      { type: "pointer", x: 0.2, y: 0.2 },
    ]);
  });

  it("uses HandFrame as the canonical entry point and keeps handedness stable", () => {
    const engine = new GestureEngine({ twoHandActivationMs: 200 });
    const left = tracked(openPalm(0.3), "Left");
    const right = tracked(openPalm(0.7), "Right");
    expect(engine.updateFrame(frame(0, [right, left]))).toEqual([]);
    expect(engine.updateFrame(frame(200, [left, right]))).toEqual([
      { type: "two_hand_start", timestampMs: 200 },
    ]);
    expect(engine.updateFrame(frame(216, [right, left]))).toEqual([]);
  });

  it("does not confuse handedness confidence with tracking confidence", () => {
    const engine = new GestureEngine({ openPalmActivationMs: 0 });
    const uncertainHandedness = {
      ...tracked(openPalm(0.5), "Unknown"),
      handednessConfidence: 0.1,
    };
    expect(engine.updateFrame(frame(0, [uncertainHandedness])).map((event) => event.type))
      .toEqual(["open_palm"]);
  });

  it("treats non-finite landmark coordinates as tracking dropout", () => {
    const engine = new GestureEngine({ trackingDropoutGraceMs: 150 });
    const invalid = tracked(landmarks({ 8: { x: Number.NaN } }), "Right");
    expect(engine.updateFrame(frame(0, [invalid]))).toEqual([]);
    expect(engine.updateFrame(frame(150, [invalid])).map((event) => event.type)).toEqual(["no_hand"]);
  });

  it("treats invalid canonical frame dimensions as tracking dropout", () => {
    const engine = new GestureEngine({ trackingDropoutGraceMs: 150 });
    const invalidFrame = { ...frame(0, [tracked(landmarks(), "Right")]), frameWidth: 0 };
    expect(engine.updateFrame(invalidFrame)).toEqual([]);
    expect(engine.updateFrame({ ...invalidFrame, timestampMs: 150 }).map((event) => event.type))
      .toEqual(["no_hand"]);
  });

  it("enforces Pinch over Open Palm over Pointer priority", () => {
    const pinchEngine = new GestureEngine({ pinchActivationMs: 0 });
    expect(pinchEngine.update(pinchHand(0.15, 0.2), 0).map((event) => event.type)).toEqual([
      "pinch_state", "pinch",
    ]);
    const palmEngine = new GestureEngine({ openPalmActivationMs: 0 });
    expect(palmEngine.update(openPalm(0.5), 0).map((event) => event.type)).toEqual(["open_palm"]);
    const pointerEngine = new GestureEngine();
    expect(pointerEngine.update(landmarks({ 8: { x: 0.4, y: 0.3 } }), 0)).toEqual([
      { type: "pointer", x: 0.4, y: 0.3 },
    ]);
  });

  it("fires Open Palm once by elapsed time while the palm stays open", () => {
    const engine = new GestureEngine({ openPalmActivationMs: 250, openPalmCooldownMs: 500 });
    expect(engine.update(openPalm(0.5), 0)).toEqual([]);
    expect(engine.update(openPalm(0.5), 249)).toEqual([]);
    expect(engine.update(openPalm(0.5), 250)).toEqual([{ type: "open_palm" }]);
    expect(engine.update(openPalm(0.5), 1_000)).toEqual([]);
  });

  it("restarts an Open Palm candidate after a higher-priority two-hand mode", () => {
    const engine = new GestureEngine({ openPalmActivationMs: 250 });
    expect(engine.update(openPalm(0.5), 0)).toEqual([]);
    expect(engine.update(openPalm(0.5), 200)).toEqual([]);
    expect(engine.update([landmarks(), landmarks()], 210)).toEqual([]);
    expect(engine.update(openPalm(0.5), 250)).toEqual([]);
    expect(engine.update(openPalm(0.5), 499)).toEqual([]);
    expect(engine.update(openPalm(0.5), 500)).toEqual([{ type: "open_palm" }]);
  });

  it("does not re-trigger an active Open Palm after a higher-priority interruption", () => {
    const engine = new GestureEngine({ openPalmActivationMs: 250 });
    engine.update(openPalm(0.5), 0);
    expect(engine.update(openPalm(0.5), 250)).toEqual([{ type: "open_palm" }]);
    expect(engine.update([landmarks(), landmarks()], 300)).toEqual([]);
    expect(engine.update(openPalm(0.5), 1_000)).toEqual([]);
  });

  it("ends active two-hand ownership when a canonical frame timestamp is non-finite", () => {
    const engine = new GestureEngine({ twoHandActivationMs: 0 });
    const hands = [tracked(openPalm(0.3), "Left"), tracked(openPalm(0.7), "Right")];
    engine.updateFrame(frame(0, hands));
    expect(engine.updateFrame(frame(0, hands)).map((event) => event.type)).toEqual(["two_hand_start"]);
    expect(engine.updateFrame(frame(Number.NaN, hands))).toEqual([
      { type: "two_hand_end", timestampMs: 0, reason: "ambiguous" },
    ]);
    expect(engine.update(landmarks({ 8: { x: 0.4, y: 0.3 } }), 10).map((event) => event.type))
      .toEqual(["pointer"]);
  });

  it("does not leak single-hand events from two non-open hands", () => {
    const engine = new GestureEngine({ pinchActivationMs: 0 });
    expect(engine.update([pinchHand(0.15, 0.2), landmarks({ 8: { x: 0.8, y: 0.3 } })], 0))
      .toEqual([]);

    engine.reset();
    expect(engine.update(pinchHand(0.15, 0.2), 10).map((event) => event.type))
      .toEqual(["pinch_state", "pinch"]);
    expect(engine.update([pinchHand(0.15, 0.2), landmarks()], 20)).toEqual([]);
  });

  it("emits combined two-hand lifecycle and baseline-relative transform events", () => {
    const engine = new GestureEngine({
      twoHandActivationMs: 200,
      twoHandZoomDeadzoneRatio: 0,
      twoHandRotationDeadzoneDegrees: 0,
      twoHandMaxZoomRatePerSecond: 100,
      twoHandMaxRotationRateDegreesPerSecond: 10_000,
    });
    const left = tracked(openPalm(0.3), "Left");
    const right = tracked(openPalm(0.7), "Right");
    engine.updateFrame(frame(0, [left, right]));
    expect(engine.updateFrame(frame(200, [left, right]))).toEqual([
      { type: "two_hand_start", timestampMs: 200 },
    ]);
    const movedLeft = tracked(translate(openPalm(0.3), -0.1, 0), "Left");
    const movedRight = tracked(translate(openPalm(0.7), 0.1, 0.1), "Right");
    const [transform] = engine.updateFrame(frame(300, [movedLeft, movedRight]));
    expect(transform).toMatchObject({ type: "two_hand_transform", timestampMs: 300 });
    if (transform.type !== "two_hand_transform") return;
    expect(transform.zoomLogDelta).toBeGreaterThan(0);
    expect(transform.rotationDeltaRad).toBeGreaterThan(0);
  });

  it("suppresses single-hand events during an active two-hand dropout grace", () => {
    const engine = new GestureEngine({ twoHandActivationMs: 0, twoHandDropoutGraceMs: 150 });
    const left = tracked(openPalm(0.3), "Left");
    const right = tracked(openPalm(0.7), "Right");
    expect(engine.updateFrame(frame(0, [left, right]))).toEqual([]);
    expect(engine.updateFrame(frame(0, [left, right])).map((event) => event.type))
      .toEqual(["two_hand_start"]);
    expect(engine.updateFrame(frame(100, [left]))).toEqual([]);
    expect(engine.updateFrame(frame(251, [left]))).toEqual([
      { type: "two_hand_end", timestampMs: 251, reason: "dropout" },
    ]);
  });

  it("emits no_hand once after tracking dropout grace and auto-exits later", () => {
    const engine = new GestureEngine({ trackingDropoutGraceMs: 150, autoExitTimeoutMs: 15_000 });
    expect(engine.update(null, 0)).toEqual([]);
    expect(engine.update(null, 149)).toEqual([]);
    expect(engine.update(null, 150)).toEqual([{ type: "no_hand" }]);
    expect(engine.update(null, 15_000)).toEqual([{ type: "auto_exit" }]);
    expect(engine.update(null, 20_000)).toEqual([]);
  });
});
