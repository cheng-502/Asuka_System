import { describe, expect, it, vi } from "vitest";
import { HandTracker, DEFAULT_HAND_MODEL_PATH, DEFAULT_WASM_PATH, firstHandLandmarks } from "../src/hand/HandTracker";

describe("local Hand Landmarker adapter", () => {
  it("uses versioned local model and WASM paths", () => {
    expect(DEFAULT_HAND_MODEL_PATH).toBe("/models/hand_landmarker.task");
    expect(DEFAULT_WASM_PATH).toBe("/wasm");
  });

  it("normalizes the first MediaPipe hand result", () => {
    const result = firstHandLandmarks({ landmarks: [[{ x: 0.2, y: 0.3, z: -0.1 }]] } as never);

    expect(result).toEqual([{ x: 0.2, y: 0.3, z: -0.1 }]);
  });

  it("stops camera tracks, detaches the video, and closes the landmarker", () => {
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
    const stopTrack = vi.fn();
    const closeLandmarker = vi.fn();
    const pauseVideo = vi.fn();
    const video = { pause: pauseVideo, srcObject: { getTracks: () => [{ stop: stopTrack }] } } as unknown as HTMLVideoElement;
    const tracker = new HandTracker({ onLandmarks: vi.fn() });
    Object.assign(tracker, {
      stream: video.srcObject,
      video,
      landmarker: { close: closeLandmarker },
    });

    tracker.stop();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(0);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(pauseVideo).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
    expect(closeLandmarker).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
