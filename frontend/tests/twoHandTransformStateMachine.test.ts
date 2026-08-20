import { describe, expect, it } from "vitest";
import {
  TwoHandTransformStateMachine,
  type TwoHandTransformHand,
} from "../src/hand/TwoHandTransformStateMachine";

function hand(
  handedness: TwoHandTransformHand["handedness"],
  indexX: number,
  indexY = 0.5,
): TwoHandTransformHand {
  const landmarks = Array.from({ length: 21 }, () => ({ x: indexX, y: indexY }));
  landmarks[0] = { x: indexX, y: indexY + 0.2 };
  landmarks[8] = { x: indexX, y: indexY };
  landmarks[9] = { x: indexX, y: indexY + 0.05 };
  return { handedness, landmarks };
}

function pair(distance: number, angle = 0): readonly [TwoHandTransformHand, TwoHandTransformHand] {
  const halfX = Math.cos(angle) * distance / 2;
  const halfY = Math.sin(angle) * distance / 2;
  return [
    hand("Left", 0.5 - halfX, 0.5 - halfY),
    hand("Right", 0.5 + halfX, 0.5 + halfY),
  ];
}

function sumTransforms(events: ReturnType<TwoHandTransformStateMachine["update"]>) {
  return events.reduce(
    (sum, event) => event.type === "two_hand_transform"
      ? {
          zoom: sum.zoom + event.zoomLogDelta,
          rotation: sum.rotation + event.rotationDeltaRad,
        }
      : sum,
    { zoom: 0, rotation: 0 },
  );
}

function activate(
  machine: TwoHandTransformStateMachine,
  hands: readonly TwoHandTransformHand[] = pair(0.4),
): void {
  machine.update(0, hands, true);
  expect(machine.update(200, hands, true)).toEqual([
    { type: "two_hand_start", timestampMs: 200 },
  ]);
}

describe("TwoHandTransformStateMachine", () => {
  it("arms for 200 ms, starts once, and emits baseline-relative log zoom", () => {
    const machine = new TwoHandTransformStateMachine({
      zoomDeadzoneRatio: 0,
      maxZoomRatePerSecond: 1_000_000,
    });

    expect(machine.update(0, pair(0.4), true)).toEqual([]);
    expect(machine.update(199, pair(0.4), true)).toEqual([]);
    expect(machine.update(200, pair(0.4), true)).toEqual([
      { type: "two_hand_start", timestampMs: 200 },
    ]);
    const [transform] = machine.update(300, pair(0.8), true);
    expect(transform).toMatchObject({
      type: "two_hand_transform",
      timestampMs: 300,
      rotationDeltaRad: 0,
    });
    expect(transform.type === "two_hand_transform" && transform.zoomLogDelta)
      .toBeCloseTo(Math.log(2));
  });

  it("requires two open palms continuously for the full activation interval", () => {
    const machine = new TwoHandTransformStateMachine();
    expect(machine.update(0, pair(0.4), false)).toEqual([]);
    expect(machine.update(100, pair(0.4), true)).toEqual([]);
    expect(machine.update(250, pair(0.4), false)).toEqual([]);
    expect(machine.update(251, pair(0.4), true)).toEqual([]);
    expect(machine.update(450, pair(0.4), true)).toEqual([]);
    expect(machine.update(451, pair(0.4), true)).toEqual([
      { type: "two_hand_start", timestampMs: 451 },
    ]);
  });

  it("applies continuous zoom and rotation deadzones without a threshold jump", () => {
    const zoom = new TwoHandTransformStateMachine({ maxZoomRatePerSecond: 100 });
    activate(zoom);
    expect(zoom.update(300, pair(0.4 * 1.029), true)).toEqual([]);
    const [zoomEvent] = zoom.update(400, pair(0.4 * 1.04), true);
    expect(zoomEvent.type === "two_hand_transform" && zoomEvent.zoomLogDelta)
      .toBeCloseTo(Math.log(1.04) - Math.log(1.03));

    const rotation = new TwoHandTransformStateMachine({
      zoomDeadzoneRatio: 1,
      maxRotationRateDegreesPerSecond: 10_000,
    });
    activate(rotation);
    expect(rotation.update(300, pair(0.4, 2.9 * Math.PI / 180), true)).toEqual([]);
    const [rotationEvent] = rotation.update(400, pair(0.4, 4 * Math.PI / 180), true);
    expect(rotationEvent.type === "two_hand_transform" && rotationEvent.rotationDeltaRad)
      .toBeCloseTo(Math.PI / 180);
  });

  it("unwraps rotation across the plus/minus pi boundary", () => {
    const machine = new TwoHandTransformStateMachine({
      rotationDeadzoneDegrees: 0,
      maxRotationRateDegreesPerSecond: 10_000,
    });
    const start = pair(0.4, 179 * Math.PI / 180);
    activate(machine, start);
    const [event] = machine.update(300, pair(0.4, -179 * Math.PI / 180), true);
    expect(event.type === "two_hand_transform" && event.rotationDeltaRad)
      .toBeCloseTo(2 * Math.PI / 180);
  });

  it("caps zoom and rotation by elapsed time", () => {
    const machine = new TwoHandTransformStateMachine({
      zoomDeadzoneRatio: 0,
      rotationDeadzoneDegrees: 0,
      maxZoomRatePerSecond: 1,
      maxRotationRateDegreesPerSecond: 120,
    });
    activate(machine);
    const [event] = machine.update(300, pair(1.6, Math.PI / 2), true);
    expect(event.type).toBe("two_hand_transform");
    if (event.type !== "two_hand_transform") return;
    expect(event.zoomLogDelta).toBeCloseTo(Math.log(2) * 0.1);
    expect(event.rotationDeltaRad).toBeCloseTo(12 * Math.PI / 180);
  });

  it("produces equivalent totals for equivalent 30 FPS and 60 FPS motion", () => {
    function replay(fps: number) {
      const machine = new TwoHandTransformStateMachine({
        zoomDeadzoneRatio: 0,
        rotationDeadzoneDegrees: 0,
        maxZoomRatePerSecond: 100,
        maxRotationRateDegreesPerSecond: 10_000,
      });
      activate(machine);
      const total = { zoom: 0, rotation: 0 };
      const frames = fps;
      for (let frame = 1; frame <= frames; frame += 1) {
        const progress = frame / frames;
        const timestamp = 200 + 1_000 * progress;
        const delta = sumTransforms(machine.update(
          timestamp,
          pair(0.4 * Math.exp(0.5 * progress), 0.8 * progress),
          true,
        ));
        total.zoom += delta.zoom;
        total.rotation += delta.rotation;
      }
      return total;
    }

    const at30 = replay(30);
    const at60 = replay(60);
    expect(at30.zoom).toBeCloseTo(0.5, 8);
    expect(at30.rotation).toBeCloseTo(0.8, 8);
    expect(at60.zoom).toBeCloseTo(at30.zoom, 8);
    expect(at60.rotation).toBeCloseTo(at30.rotation, 8);
  });

  it("keeps handedness identity stable when detector result order changes", () => {
    const machine = new TwoHandTransformStateMachine({
      zoomDeadzoneRatio: 0,
      rotationDeadzoneDegrees: 0,
    });
    const hands = pair(0.4);
    activate(machine, hands);
    expect(machine.update(250, [hands[1], hands[0]], true)).toEqual([]);
  });

  it("supports unknown-handed hands and preserves identity across array reorder", () => {
    const machine = new TwoHandTransformStateMachine({
      zoomDeadzoneRatio: 0,
      rotationDeadzoneDegrees: 0,
    });
    const left = hand("Unknown", 0.3);
    const right = hand("Unknown", 0.7);
    activate(machine, [left, right]);
    expect(machine.update(250, [right, left], true)).toEqual([]);
  });

  it("suspends on a short dropout and rebaselines without replaying lost motion", () => {
    const machine = new TwoHandTransformStateMachine({ zoomDeadzoneRatio: 0 });
    activate(machine);
    expect(machine.update(250, null, false)).toEqual([]);
    expect(machine.update(350, pair(0.8), true)).toEqual([]);
    const [event] = machine.update(450, pair(1.0), true);
    expect(event.type === "two_hand_transform" && event.zoomLogDelta)
      .toBeCloseTo(Math.log(2) * 0.1); // rate-limited from the recovered baseline
  });

  it("ends after dropout grace and requires a fresh 200 ms activation", () => {
    const machine = new TwoHandTransformStateMachine();
    activate(machine);
    expect(machine.update(250, null, false)).toEqual([]);
    expect(machine.update(400, null, false)).toEqual([
      { type: "two_hand_end", timestampMs: 400, reason: "dropout" },
    ]);
    expect(machine.update(402, pair(0.4), true)).toEqual([]);
    expect(machine.update(601, pair(0.4), true)).toEqual([]);
    expect(machine.update(602, pair(0.4), true)).toEqual([
      { type: "two_hand_start", timestampMs: 602 },
    ]);
  });

  it("pauses at a crossing and rebaselines instead of emitting a rotation jump", () => {
    const machine = new TwoHandTransformStateMachine({
      zoomDeadzoneRatio: 0,
      rotationDeadzoneDegrees: 0,
      maxZoomRatePerSecond: 100,
      maxRotationRateDegreesPerSecond: 10_000,
    });
    activate(machine);
    const crossing = [hand("Left", 0.49), hand("Right", 0.51)] as const;
    expect(machine.update(250, crossing, true)).toEqual([]);
    const crossed = [hand("Left", 0.6), hand("Right", 0.4)] as const;
    expect(machine.update(300, crossed, true)).toEqual([]);
    const movedAfterCrossing = [hand("Left", 0.65), hand("Right", 0.35)] as const;
    const events = machine.update(400, movedAfterCrossing, true);
    const total = sumTransforms(events);
    expect(total.rotation).toBeCloseTo(0);
    expect(total.zoom).toBeCloseTo(Math.log(1.5));
  });

  it("ends an unresolved identity ambiguity after the grace interval", () => {
    const machine = new TwoHandTransformStateMachine();
    activate(machine);
    const ambiguous = [hand("Left", 0.3), hand("Left", 0.7)] as const;
    expect(machine.update(250, ambiguous, true)).toEqual([]);
    expect(machine.update(401, ambiguous, true)).toEqual([
      { type: "two_hand_end", timestampMs: 401, reason: "ambiguous" },
    ]);
  });

  it("ends immediately when either palm closes", () => {
    const machine = new TwoHandTransformStateMachine();
    activate(machine);
    expect(machine.update(250, pair(0.4), false)).toEqual([
      { type: "two_hand_end", timestampMs: 250, reason: "released" },
    ]);
  });

  it("resets arming on non-finite time and requires a fresh activation hold", () => {
    const machine = new TwoHandTransformStateMachine();
    machine.update(0, pair(0.4), true);
    expect(machine.update(Number.NaN, pair(0.4), true)).toEqual([]);
    expect(machine.update(100, pair(0.4), true)).toEqual([]);
    expect(machine.update(299, pair(0.4), true)).toEqual([]);
    expect(machine.update(300, pair(0.4), true)).toEqual([
      { type: "two_hand_start", timestampMs: 300 },
    ]);
  });

  it("ends active mode once on non-finite or backwards time", () => {
    const nonFinite = new TwoHandTransformStateMachine();
    activate(nonFinite);
    expect(nonFinite.update(Number.NaN, pair(0.4), true)).toEqual([
      { type: "two_hand_end", timestampMs: 200, reason: "ambiguous" },
    ]);
    expect(nonFinite.update(300, pair(0.4), true)).toEqual([]);

    const backwards = new TwoHandTransformStateMachine();
    activate(backwards);
    expect(backwards.update(150, pair(0.4), true)).toEqual([
      { type: "two_hand_end", timestampMs: 150, reason: "ambiguous" },
    ]);
  });

  it("ends suspended mode when input time moves backwards", () => {
    const machine = new TwoHandTransformStateMachine();
    activate(machine);
    expect(machine.update(250, null, false)).toEqual([]);
    expect(machine.update(240, pair(0.4), true)).toEqual([
      { type: "two_hand_end", timestampMs: 240, reason: "ambiguous" },
    ]);
  });
});
