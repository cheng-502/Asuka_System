import { describe, expect, it, vi } from "vitest";
import { HandTracker, DEFAULT_HAND_MODEL_PATH, DEFAULT_WASM_PATH, MAX_HANDS, firstHandLandmarks } from "../src/hand/HandTracker";

describe("local Hand Landmarker adapter", () => {
  it("uses versioned local model and WASM paths", () => {
    expect(DEFAULT_HAND_MODEL_PATH).toBe("/models/hand_landmarker.task");
    expect(DEFAULT_WASM_PATH).toBe("/wasm");
    expect(MAX_HANDS).toBe(2);
  });

  it("normalizes the first MediaPipe hand result", () => {
    const result = firstHandLandmarks({ landmarks: [[{ x: 0.2, y: 0.3, z: -0.1 }]] } as never);

    expect(result).toEqual([[{ x: 0.2, y: 0.3, z: -0.1 }]]);
  });

  it("normalizes all detected hands for two-hand gestures", () => {
    const result = firstHandLandmarks({
      landmarks: [
        [{ x: 0.2, y: 0.3, z: -0.1 }],
        [{ x: 0.8, y: 0.3, z: -0.2 }],
      ],
    } as never);

    expect(result).toEqual([
      [{ x: 0.2, y: 0.3, z: -0.1 }],
      [{ x: 0.8, y: 0.3, z: -0.2 }],
    ]);
  });

  it("preserves one complete hand for the gesture and overlay consumers", () => {
    const landmarks = Array.from({ length: 21 }, (_, index) => ({
      x: index / 20,
      y: 0.5,
      z: -0.1,
    }));

    const result = firstHandLandmarks({ landmarks: [landmarks] } as never);

    expect(result).toHaveLength(1);
    expect(result?.[0]).toHaveLength(21);
    expect(result?.[0]?.[8]).toEqual({ x: 0.4, y: 0.5, z: -0.1 });
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
