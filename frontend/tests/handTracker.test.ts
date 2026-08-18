import { describe, expect, it } from "vitest";
import { DEFAULT_HAND_MODEL_PATH, DEFAULT_WASM_PATH, firstHandLandmarks } from "../src/hand/HandTracker";

describe("local Hand Landmarker adapter", () => {
  it("uses versioned local model and WASM paths", () => {
    expect(DEFAULT_HAND_MODEL_PATH).toBe("/models/hand_landmarker.task");
    expect(DEFAULT_WASM_PATH).toBe("/wasm");
  });

  it("normalizes the first MediaPipe hand result", () => {
    const result = firstHandLandmarks({ landmarks: [[{ x: 0.2, y: 0.3, z: -0.1 }]] } as never);

    expect(result).toEqual([{ x: 0.2, y: 0.3, z: -0.1 }]);
  });
});
