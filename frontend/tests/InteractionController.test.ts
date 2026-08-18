import { describe, expect, it, vi } from "vitest";
import { InteractionController } from "../src/app/InteractionController";

describe("InteractionController", () => {
  it("routes gesture events into the shared scene state transitions", () => {
    const target = {
      setPointer: vi.fn(),
      selectAtPointer: vi.fn(),
      clearSelection: vi.fn(),
      clearHover: vi.fn(),
      zoomBy: vi.fn(),
      rotateBy: vi.fn(),
    };
    const onExit = vi.fn();
    const controller = new InteractionController(target, { onExit });

    controller.handle({ type: "pointer", x: 0.2, y: 0.3 });
    controller.handle({ type: "pinch", x: 0.2, y: 0.3 });
    controller.handle({ type: "open_palm" });
    controller.handle({ type: "no_hand" });
    controller.handle({ type: "auto_exit" });
    controller.handle({ type: "zoom", delta: 0.12 });
    controller.handle({ type: "rotate", delta: -0.08 });

    expect(target.setPointer).toHaveBeenCalledWith(0.2, 0.3);
    expect(target.selectAtPointer).toHaveBeenCalledWith(0.2, 0.3);
    expect(target.clearSelection).toHaveBeenCalledTimes(1);
    expect(target.clearHover).toHaveBeenCalledTimes(3);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(target.zoomBy).toHaveBeenCalledWith(0.12);
    expect(target.rotateBy).toHaveBeenCalledWith(-0.08);
  });
});
