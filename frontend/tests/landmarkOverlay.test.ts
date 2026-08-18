import { describe, expect, it, vi } from "vitest";
import type { HandLandmarks } from "../src/hand/GestureEngine";
import { renderHandLandmarks } from "../src/hand/landmarkOverlay";

function hand(x: number): HandLandmarks {
  return Array.from({ length: 21 }, (_, index) => ({
    x,
    y: index / 20,
    z: 0,
  }));
}

function context() {
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;
}

describe("MediaPipe landmark overlay", () => {
  it("clears the canvas and draws all 21 landmarks with fingertip emphasis", () => {
    const canvas = context();

    renderHandLandmarks(canvas, 100, 200, [hand(0.25)]);

    expect(canvas.clearRect).toHaveBeenCalledWith(0, 0, 100, 200);
    expect(canvas.arc).toHaveBeenCalledTimes(21);
    expect(canvas.arc).toHaveBeenCalledWith(25, 40, 5, 0, Math.PI * 2);
    expect(canvas.arc).toHaveBeenCalledWith(25, 80, 5, 0, Math.PI * 2);
    expect(canvas.stroke).toHaveBeenCalled();
    expect(canvas.fill).toHaveBeenCalled();
  });

  it("uses a distinct color for the second hand", () => {
    const canvas = context();

    renderHandLandmarks(canvas, 100, 100, [hand(0.25), hand(0.75)]);

    expect(canvas.strokeStyle).toBe("#fbbf24");
    expect(canvas.fillStyle).toBe("#fbbf24");
    expect(canvas.arc).toHaveBeenCalledTimes(42);
  });

  it("clears stale landmarks when no hand is detected", () => {
    const canvas = context();

    renderHandLandmarks(canvas, 100, 100, []);

    expect(canvas.clearRect).toHaveBeenCalledWith(0, 0, 100, 100);
    expect(canvas.arc).not.toHaveBeenCalled();
  });
});
