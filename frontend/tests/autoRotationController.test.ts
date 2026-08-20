import { describe, expect, it } from "vitest";
import {
  AUTO_ROTATION_RESUME_DELAY_MS,
  AUTO_ROTATION_SPEED_RAD_PER_SECOND,
  AutoRotationController,
  type AutoRotationConditions,
} from "../src/scene/AutoRotationController";

const ready: AutoRotationConditions = {
  compactTransitionComplete: true,
  mouseDragging: false,
  wheelActive: false,
  handActive: false,
  selectionActive: false,
  hidden: false,
  reducedMotion: false,
};

describe("AutoRotationController", () => {
  it("rotates at 0.035 rad/s after the compact recovery delay", () => {
    const controller = new AutoRotationController();

    expect(AUTO_ROTATION_SPEED_RAD_PER_SECOND).toBe(0.035);
    expect(AUTO_ROTATION_RESUME_DELAY_MS).toBe(2_000);
    expect(controller.update(0, ready).phase).toBe("waiting");
    expect(controller.update(2_000, ready).angleDeltaRad).toBe(0);

    const frame = controller.update(3_000, ready);
    expect(frame.phase).toBe("running");
    expect(frame.angleDeltaRad).toBeCloseTo(0.035);
  });

  it("does not run before the compact transition completes", () => {
    const controller = new AutoRotationController();
    const transitioning = { ...ready, compactTransitionComplete: false };

    expect(controller.update(0, transitioning).phase).toBe("paused");
    expect(controller.update(10_000, transitioning).angleDeltaRad).toBe(0);
  });

  it.each([
    "mouseDragging",
    "wheelActive",
    "handActive",
    "selectionActive",
    "hidden",
    "reducedMotion",
  ] as const)("pauses immediately when %s becomes active", (condition) => {
    const controller = runningController();

    const frame = controller.update(2_100, { ...ready, [condition]: true });
    expect(frame.phase).toBe("paused");
    expect(frame.angleDeltaRad).toBe(0);
    expect(frame.blockers).toContain(condition);
  });

  it("waits two seconds after every blocker clears before resuming", () => {
    const controller = runningController();
    controller.update(2_100, { ...ready, handActive: true });

    expect(controller.update(2_200, ready).phase).toBe("waiting");
    expect(controller.update(4_199, ready).angleDeltaRad).toBe(0);
    expect(controller.update(4_200, ready).phase).toBe("running");
    expect(controller.update(4_300, ready).angleDeltaRad).toBeCloseTo(0.0035);
  });

  it("restarts the recovery delay if another blocker appears", () => {
    const controller = runningController();
    controller.update(2_100, { ...ready, selectionActive: true });
    controller.update(2_200, ready);
    controller.update(3_000, { ...ready, wheelActive: true });

    expect(controller.update(3_100, ready).phase).toBe("waiting");
    expect(controller.update(5_099, ready).angleDeltaRad).toBe(0);
    expect(controller.update(5_100, ready).phase).toBe("running");
  });

  it("does not rotate or corrupt state when timestamps move backward", () => {
    const controller = runningController();
    expect(controller.update(2_100, ready).angleDeltaRad).toBeCloseTo(0.0035);

    expect(controller.update(2_050, ready).angleDeltaRad).toBe(0);
    expect(controller.update(2_150, ready).angleDeltaRad).toBeCloseTo(0.00175, 6);
  });

  it("drops large frame gaps instead of applying catch-up rotation", () => {
    const controller = runningController();

    expect(controller.update(10_000, ready).angleDeltaRad).toBe(0);
    expect(controller.update(10_100, ready).angleDeltaRad).toBeCloseTo(0.0035);
  });

  it("exposes immutable snapshots suitable for integration", () => {
    const controller = new AutoRotationController();
    const snapshot = controller.update(0, {
      ...ready,
      hidden: true,
      reducedMotion: true,
    });

    expect(snapshot).toEqual({
      angleDeltaRad: 0,
      phase: "paused",
      blockers: ["hidden", "reducedMotion"],
      resumeAtMs: null,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.blockers)).toBe(true);
  });
});

function runningController(): AutoRotationController {
  const controller = new AutoRotationController();
  controller.update(0, ready);
  controller.update(2_000, ready);
  return controller;
}
