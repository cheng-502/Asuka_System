import { describe, expect, it } from "vitest";
import { PinchStateMachine, normalizedPinchRatio } from "../src/hand/PinchStateMachine";
import type { HandLandmark } from "../src/hand/GestureEngine";

function hand(palmScale: number, pinchRatio: number): HandLandmark[] {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  points[0] = { x: 0.5, y: 0.7 };
  points[9] = { x: 0.5, y: 0.7 - palmScale };
  points[4] = { x: 0.5, y: 0.3 };
  points[8] = { x: 0.5 + palmScale * pinchRatio, y: 0.3 };
  return points;
}

const config = {
  enterRatio: 0.32,
  releaseRatio: 0.48,
  activationMs: 120,
  cooldownMs: 150,
  palmEpsilon: 0.01,
};

describe("PinchStateMachine", () => {
  it("normalizes thumb-index distance by palm scale", () => {
    expect(normalizedPinchRatio(hand(0.1, 0.3), 0.01)).toBeCloseTo(0.3);
    expect(normalizedPinchRatio(hand(0.25, 0.3), 0.01)).toBeCloseTo(0.3);
  });

  it("activates once by elapsed time across different frame rates", () => {
    for (const step of [16, 33]) {
      const machine = new PinchStateMachine(config);
      const events = [];
      for (let time = 0; time <= 200; time += step) events.push(machine.update(time, hand(0.15, 0.25)));
      expect(events.filter((event) => event.activated)).toHaveLength(1);
      expect(events.at(-1)?.active).toBe(true);
    }
  });

  it("uses release hysteresis and cooldown before retriggering", () => {
    const machine = new PinchStateMachine(config);
    machine.update(0, hand(0.15, 0.25));
    expect(machine.update(120, hand(0.15, 0.25)).activated).toBe(true);
    expect(machine.update(140, hand(0.15, 0.40)).active).toBe(true);
    expect(machine.update(160, hand(0.15, 0.50)).released).toBe(true);
    expect(machine.update(250, hand(0.15, 0.25)).activated).toBe(false);
    machine.update(310, hand(0.15, 0.25));
    expect(machine.update(430, hand(0.15, 0.25)).activated).toBe(true);
  });

  it("cancels an active pinch on landmark dropout", () => {
    const machine = new PinchStateMachine(config);
    machine.update(0, hand(0.15, 0.25));
    machine.update(120, hand(0.15, 0.25));
    const cancelled = machine.update(130, null);
    expect(cancelled).toMatchObject({ active: false, released: true, ratio: null });
  });

  it("requires an observed release after dropout before it can re-arm", () => {
    const machine = new PinchStateMachine(config);
    machine.update(0, hand(0.15, 0.25));
    machine.update(120, hand(0.15, 0.25));
    machine.update(130, null);
    expect(machine.update(500, hand(0.15, 0.25)).activated).toBe(false);
    expect(machine.update(700, hand(0.15, 0.25)).activated).toBe(false);
    expect(machine.update(710, hand(0.15, 0.55)).activated).toBe(false);
    machine.update(860, hand(0.15, 0.25));
    expect(machine.update(980, hand(0.15, 0.25)).activated).toBe(true);
  });

  it("treats timestamp rollback as cancellation requiring an observed release", () => {
    const machine = new PinchStateMachine(config);
    machine.update(0, hand(0.15, 0.25));
    machine.update(120, hand(0.15, 0.25));
    expect(machine.update(100, hand(0.15, 0.25)).released).toBe(true);
    expect(machine.update(400, hand(0.15, 0.25)).activated).toBe(false);
    machine.update(410, hand(0.15, 0.55));
    machine.update(560, hand(0.15, 0.25));
    expect(machine.update(680, hand(0.15, 0.25)).activated).toBe(true);
  });

  it("recovers from a non-finite timestamp without poisoning later timing", () => {
    const machine = new PinchStateMachine(config);
    expect(machine.update(Number.NaN, hand(0.15, 0.25))).toMatchObject({
      active: false, activated: false, ratio: null,
    });
    machine.update(1_000, hand(0.15, 0.25));
    expect(machine.update(1_120, hand(0.15, 0.25)).activated).toBe(true);
  });
});
