import { describe, expect, it } from "vitest";
import { GestureEngine, type HandLandmark } from "../src/hand/GestureEngine";

function landmarks(overrides: Partial<Record<number, Partial<HandLandmark>>> = {}): HandLandmark[] {
  return Array.from({ length: 21 }, (_, index) => ({ x: 0.2 + index * 0.005, y: 0.7, ...overrides[index] }));
}

function openPalm(indexX: number, indexY = 0.2): HandLandmark[] {
  return landmarks({
    8: { x: indexX, y: indexY }, 6: { x: indexX, y: indexY + 0.3 },
    12: { x: indexX, y: indexY }, 10: { x: indexX, y: indexY + 0.3 },
    16: { x: indexX, y: indexY }, 14: { x: indexX, y: indexY + 0.3 },
    20: { x: indexX, y: indexY }, 18: { x: indexX, y: indexY + 0.3 },
    4: { x: indexX + 0.1, y: 0.8 },
  });
}

describe("GestureEngine", () => {
  it("emits a timestamp-filtered screen-space Pointer", () => {
    const engine = new GestureEngine({ pointerDeadzonePx: 0 });
    expect(engine.update(landmarks({ 8: { x: 0.2, y: 0.2 }, 4: { x: 0.8, y: 0.8 } }), 0)).toEqual([
      { type: "pointer", x: 0.2, y: 0.2 },
    ]);
    const moved = engine.update(
      landmarks({ 8: { x: 0.8, y: 0.8 }, 4: { x: 0.1, y: 0.1 } }),
      16,
      { width: 1920, height: 1080 },
    )[0] as { type: "pointer"; x: number; y: number };
    expect(moved.x).toBeGreaterThan(0.2);
    expect(moved.x).toBeLessThan(0.8);
    expect(moved.y).toBeGreaterThan(0.2);
    expect(moved.y).toBeLessThan(0.8);
  });

  it("resets pointer filtering after the configured no-hand transition", () => {
    const engine = new GestureEngine({ pointerDeadzonePx: 0, noHandTimeoutFrames: 1 });
    engine.update(landmarks({ 8: { x: 0.2, y: 0.2 } }), 0);
    engine.update(landmarks({ 8: { x: 0.8, y: 0.8 } }), 16);
    expect(engine.update(null, 32)).toEqual([{ type: "no_hand" }]);
    expect(engine.update(landmarks({ 8: { x: 0.7, y: 0.7 } }), 48)).toContainEqual({
      type: "pointer", x: 0.7, y: 0.7,
    });
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

  it("emits incremental zoom deltas when two open palms move apart or together", () => {
    const engine = new GestureEngine({ twoHandChangeThreshold: 0.01 });
    expect(engine.update([openPalm(0.25), openPalm(0.75)]).map((event) => event.type)).toEqual([]);

    const apart = engine.update([openPalm(0.15), openPalm(0.85)]);
    expect(apart[0].type).toBe("zoom");
    expect((apart[0] as { type: "zoom"; delta: number }).delta).toBeGreaterThan(0);

    const together = engine.update([openPalm(0.3), openPalm(0.7)]);
    expect(together[0].type).toBe("zoom");
    expect((together[0] as { type: "zoom"; delta: number }).delta).toBeLessThan(0);
  });

  it("emits an incremental rotate delta from the two-index-finger angle", () => {
    const engine = new GestureEngine({ twoHandRotationThreshold: 0.02, twoHandChangeThreshold: 0.2 });
    engine.update([openPalm(0.25, 0.5), openPalm(0.75, 0.5)]);

    const events = engine.update([openPalm(0.25, 0.5), openPalm(0.75, 0.7)]);
    expect(events[0].type).toBe("rotate");
    expect((events[0] as { type: "rotate"; delta: number }).delta).toBeGreaterThan(0);
  });

  it("keeps two-hand tracking stable when MediaPipe changes hand result order", () => {
    const engine = new GestureEngine({ twoHandChangeThreshold: 0.2, twoHandRotationThreshold: 0.02 });
    engine.update([openPalm(0.25), openPalm(0.75)]);

    expect(engine.update([openPalm(0.75), openPalm(0.25)])).toEqual([]);
  });
});
