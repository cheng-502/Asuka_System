import { describe, expect, it } from "vitest";
import { GestureEngine, type HandLandmark } from "../src/hand/GestureEngine";

function landmarks(overrides: Partial<Record<number, Partial<HandLandmark>>> = {}): HandLandmark[] {
  return Array.from({ length: 21 }, (_, index) => ({ x: 0.2 + index * 0.005, y: 0.7, ...overrides[index] }));
}

describe("GestureEngine", () => {
  it("emits a smoothed screen-space Pointer", () => {
    const engine = new GestureEngine({ pointerSmoothing: 0.5 });
    expect(engine.update(landmarks({ 8: { x: 0.2, y: 0.2 }, 4: { x: 0.8, y: 0.8 } }))).toEqual([
      { type: "pointer", x: 0.2, y: 0.2 },
    ]);
    expect(engine.update(landmarks({ 8: { x: 0.8, y: 0.8 }, 4: { x: 0.1, y: 0.1 } }))).toEqual([
      { type: "pointer", x: 0.5, y: 0.5 },
    ]);
  });

  it("fires Pinch once after stable frames and retriggers after release", () => {
    const engine = new GestureEngine({ pinchStableFrames: 2 });
    const pinched = landmarks({ 4: { x: 0.2, y: 0.2 }, 8: { x: 0.22, y: 0.22 } });
    const released = landmarks({ 4: { x: 0.8, y: 0.8 }, 8: { x: 0.2, y: 0.2 } });
    expect(engine.update(pinched).map((event) => event.type)).toEqual(["pointer"]);
    expect(engine.update(pinched).map((event) => event.type)).toEqual(["pointer", "pinch"]);
    expect(engine.update(pinched).map((event) => event.type)).toEqual(["pointer"]);
    engine.update(released);
    expect(engine.update(pinched).map((event) => event.type)).toEqual(["pointer"]);
    expect(engine.update(pinched).map((event) => event.type)).toEqual(["pointer", "pinch"]);
  });

  it("fires Open Palm once after stable frames", () => {
    const engine = new GestureEngine({ openPalmStableFrames: 2 });
    const palm = landmarks({
      8: { y: 0.2 }, 6: { y: 0.5 }, 12: { y: 0.2 }, 10: { y: 0.5 },
      16: { y: 0.2 }, 14: { y: 0.5 }, 20: { y: 0.2 }, 18: { y: 0.5 },
      4: { x: 0.9, y: 0.9 },
    });
    expect(engine.update(palm).map((event) => event.type)).toEqual(["pointer"]);
    expect(engine.update(palm).map((event) => event.type)).toEqual(["pointer", "open_palm"]);
    expect(engine.update(palm).map((event) => event.type)).toEqual(["pointer"]);
  });

  it("emits No Hand once after the configured timeout", () => {
    const engine = new GestureEngine({ noHandTimeoutFrames: 2 });
    expect(engine.update(null)).toEqual([]);
    expect(engine.update(null)).toEqual([{ type: "no_hand" }]);
    expect(engine.update(null)).toEqual([]);
  });

  it("emits Auto Exit once after a long no-hand interval and resets when a hand returns", () => {
    const engine = new GestureEngine({ noHandTimeoutFrames: 2, autoExitTimeoutMs: 15_000 });
    expect(engine.update(null, 0)).toEqual([]);
    expect(engine.update(null, 100)).toEqual([{ type: "no_hand" }]);
    expect(engine.update(null, 14_999)).toEqual([]);
    expect(engine.update(null, 15_000)).toEqual([{ type: "auto_exit" }]);
    expect(engine.update(null, 20_000)).toEqual([]);
    expect(engine.update(landmarks(), 20_001).map((event) => event.type)).toEqual(["pointer"]);
    expect(engine.update(null, 20_002)).toEqual([]);
    expect(engine.update(null, 20_102)).toEqual([{ type: "no_hand" }]);
  });
});
