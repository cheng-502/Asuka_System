import { describe, expect, it } from "vitest";
import {
  OpenPalmStateMachine,
  isOpenPalm,
  type OpenPalmConfig,
  type OpenPalmLandmark,
} from "../src/hand/OpenPalmStateMachine";

const config: OpenPalmConfig = {
  activationMs: 250,
  cooldownMs: 500,
  dropoutGraceMs: 150,
  jointCosineThreshold: 0.5,
  tipExtensionRatio: 0.1,
  palmEpsilon: 0.01,
};

function openHand(): OpenPalmLandmark[] {
  const hand = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.8, z: 0 }));
  hand[0] = { x: 0.5, y: 0.8, z: 0 };
  const fingers = [
    [5, 6, 7, 8, 0.35],
    [9, 10, 11, 12, 0.45],
    [13, 14, 15, 16, 0.55],
    [17, 18, 19, 20, 0.65],
  ] as const;
  for (const [mcp, pip, dip, tip, x] of fingers) {
    hand[mcp] = { x, y: 0.62, z: 0 };
    hand[pip] = { x, y: 0.48, z: 0 };
    hand[dip] = { x, y: 0.34, z: 0 };
    hand[tip] = { x, y: 0.2, z: 0 };
  }
  return hand;
}

function transform(
  hand: readonly OpenPalmLandmark[],
  angleRadians: number,
  mirrorX = false,
): OpenPalmLandmark[] {
  const center = hand[0];
  const cosine = Math.cos(angleRadians);
  const sine = Math.sin(angleRadians);
  return hand.map((point) => {
    const dx = (mirrorX ? -(point.x - center.x) : point.x - center.x);
    const dy = point.y - center.y;
    return {
      x: center.x + dx * cosine - dy * sine,
      y: center.y + dx * sine + dy * cosine,
      z: point.z,
    };
  });
}

function scaleAroundWrist(
  hand: readonly OpenPalmLandmark[],
  scale: number,
): OpenPalmLandmark[] {
  const wrist = hand[0];
  return hand.map((point) => ({
    x: wrist.x + (point.x - wrist.x) * scale,
    y: wrist.y + (point.y - wrist.y) * scale,
    z: (wrist.z ?? 0) + ((point.z ?? 0) - (wrist.z ?? 0)) * scale,
  }));
}

function closedHand(): OpenPalmLandmark[] {
  const hand = openHand();
  hand[7] = { x: 0.35, y: 0.55, z: 0 };
  hand[8] = { x: 0.35, y: 0.7, z: 0 };
  return hand;
}

describe("isOpenPalm", () => {
  it("recognizes four extended fingers independent of rotation and mirroring", () => {
    const hand = openHand();
    expect(isOpenPalm(hand, config)).toBe(true);
    expect(isOpenPalm(transform(hand, Math.PI / 2), config)).toBe(true);
    expect(isOpenPalm(transform(hand, Math.PI), config)).toBe(true);
    expect(isOpenPalm(transform(hand, Math.PI / 3, true), config)).toBe(true);
  });

  it("remains scale independent above the configured palm epsilon", () => {
    expect(isOpenPalm(scaleAroundWrist(openHand(), 0.1), config)).toBe(true);
  });

  it("rejects a bent finger and invalid or degenerate landmarks", () => {
    expect(isOpenPalm(closedHand(), config)).toBe(false);
    expect(isOpenPalm(openHand().slice(0, 20), config)).toBe(false);
    const nonFinite = openHand();
    nonFinite[8] = { ...nonFinite[8], x: Number.NaN };
    expect(isOpenPalm(nonFinite, config)).toBe(false);
    const degenerate = openHand();
    degenerate[9] = { ...degenerate[0] };
    expect(isOpenPalm(degenerate, config)).toBe(false);
  });
});

describe("OpenPalmStateMachine", () => {
  it("activates after the configured duration and fires only once while held", () => {
    const machine = new OpenPalmStateMachine(config);
    expect(machine.update(0, openHand())).toEqual({ activated: false, active: false });
    expect(machine.update(249, openHand())).toEqual({ activated: false, active: false });
    expect(machine.update(250, openHand())).toEqual({ activated: true, active: true });
    expect(machine.update(2_000, openHand())).toEqual({ activated: false, active: true });
  });

  it("uses elapsed milliseconds rather than frame counts", () => {
    const at30Fps = new OpenPalmStateMachine(config);
    const at60Fps = new OpenPalmStateMachine(config);
    for (let timestamp = 0; timestamp < 250; timestamp += 1000 / 30) {
      at30Fps.update(timestamp, openHand());
    }
    for (let timestamp = 0; timestamp < 250; timestamp += 1000 / 60) {
      at60Fps.update(timestamp, openHand());
    }
    expect(at30Fps.update(250, openHand()).activated).toBe(true);
    expect(at60Fps.update(250, openHand()).activated).toBe(true);
  });

  it("requires release, cooldown, and a new activation hold before retriggering", () => {
    const machine = new OpenPalmStateMachine(config);
    machine.update(0, openHand());
    expect(machine.update(250, openHand()).activated).toBe(true);
    expect(machine.update(300, closedHand())).toEqual({ activated: false, active: false });
    expect(machine.update(799, openHand())).toEqual({ activated: false, active: false });
    expect(machine.update(800, openHand())).toEqual({ activated: false, active: false });
    expect(machine.update(1_049, openHand())).toEqual({ activated: false, active: false });
    expect(machine.update(1_050, openHand())).toEqual({ activated: true, active: true });
  });

  it("pauses activation timing during a short dropout", () => {
    const machine = new OpenPalmStateMachine(config);
    machine.update(0, openHand());
    machine.update(100, null);
    expect(machine.update(200, openHand())).toEqual({ activated: false, active: false });
    expect(machine.update(349, openHand())).toEqual({ activated: false, active: false });
    expect(machine.update(350, openHand())).toEqual({ activated: true, active: true });
  });

  it("clears state after a dropout exceeds the grace duration", () => {
    const machine = new OpenPalmStateMachine(config);
    machine.update(0, openHand());
    machine.update(100, null);
    machine.update(251, null);
    expect(machine.update(300, openHand())).toEqual({ activated: false, active: false });
    expect(machine.update(549, openHand())).toEqual({ activated: false, active: false });
    expect(machine.update(550, openHand())).toEqual({ activated: true, active: true });
  });

  it("recovers from NaN without corrupting elapsed time", () => {
    const machine = new OpenPalmStateMachine(config);
    machine.update(0, openHand());
    expect(machine.update(Number.NaN, openHand())).toEqual({ activated: false, active: false });
    expect(machine.update(200, openHand())).toEqual({ activated: false, active: false });
    expect(machine.update(449, openHand())).toEqual({ activated: false, active: false });
    expect(machine.update(450, openHand())).toEqual({ activated: true, active: true });
  });

  it("does not retrigger a held palm after time moves backwards", () => {
    const machine = new OpenPalmStateMachine(config);
    machine.update(0, openHand());
    expect(machine.update(250, openHand()).activated).toBe(true);
    expect(machine.update(200, openHand())).toEqual({ activated: false, active: false });
    expect(machine.update(1_000, openHand())).toEqual({ activated: false, active: false });
    machine.update(1_001, closedHand());
    expect(machine.update(1_501, openHand())).toEqual({ activated: false, active: false });
    expect(machine.update(1_751, openHand())).toEqual({ activated: true, active: true });
  });

  it("interrupts only a pending candidate while preserving an active hold", () => {
    const candidate = new OpenPalmStateMachine(config);
    candidate.update(0, openHand());
    candidate.update(200, openHand());
    candidate.interruptCandidate();
    expect(candidate.update(250, openHand()).activated).toBe(false);
    expect(candidate.update(500, openHand()).activated).toBe(true);

    const active = new OpenPalmStateMachine(config);
    active.update(0, openHand());
    active.update(250, openHand());
    active.interruptCandidate();
    expect(active.update(1_000, openHand())).toEqual({ activated: false, active: true });
  });
});
