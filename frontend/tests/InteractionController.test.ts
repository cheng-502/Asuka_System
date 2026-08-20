import { describe, expect, it, vi } from "vitest";
import { InteractionController } from "../src/app/InteractionController";

describe("InteractionController", () => {
  it("routes gesture events into the shared scene state transitions", () => {
    const target = {
      setPointer: vi.fn(),
      selectAtPointer: vi.fn(),
      clearSelection: vi.fn(),
      clearHover: vi.fn(),
      beginHandTransform: vi.fn(),
      applyHandTransform: vi.fn(),
      endHandTransform: vi.fn(),
    };
    const onExit = vi.fn();
    const controller = new InteractionController(target, { onExit });

    controller.handle({ type: "pointer", x: 0.2, y: 0.3 });
    controller.handle({ type: "pinch", x: 0.2, y: 0.3 });
    controller.handle({ type: "open_palm" });
    controller.handle({ type: "no_hand" });
    controller.handle({ type: "auto_exit" });
    controller.handle({ type: "two_hand_start", timestampMs: 10 });
    controller.handle({
      type: "two_hand_transform",
      timestampMs: 20,
      zoomLogDelta: 0.12,
      rotationDeltaRad: -0.08,
    });
    controller.handle({ type: "two_hand_end", timestampMs: 30, reason: "released" });

    expect(target.setPointer).toHaveBeenCalledWith(0.2, 0.3);
    expect(target.selectAtPointer).toHaveBeenCalledWith(0.2, 0.3);
    expect(target.clearSelection).toHaveBeenCalledTimes(1);
    expect(target.clearHover).toHaveBeenCalledTimes(3);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(target.beginHandTransform).toHaveBeenCalledTimes(1);
    expect(target.applyHandTransform).toHaveBeenCalledWith(0.12, -0.08);
    expect(target.endHandTransform).toHaveBeenCalledTimes(1);
  });
});
