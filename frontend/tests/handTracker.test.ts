import { describe, expect, it, vi } from "vitest";
import { HandTracker, DEFAULT_HAND_MODEL_PATH, DEFAULT_WASM_PATH, MAX_HANDS, handFrameFromResult } from "../src/hand/HandTracker";

describe("local Hand Landmarker adapter", () => {
  it("uses versioned local model and WASM paths", () => {
    expect(DEFAULT_HAND_MODEL_PATH).toBe("/models/hand_landmarker.task");
    expect(DEFAULT_WASM_PATH).toBe("/wasm");
    expect(MAX_HANDS).toBe(2);
  });

  it("creates a canonical frame with dimensions, handedness, confidence, and landmarks", () => {
    const landmarks = Array.from({ length: 21 }, (_, index) => ({
      x: index / 20,
      y: 0.5,
      z: -0.1,
    }));

    const frame = handFrameFromResult({
      landmarks: [landmarks],
      handednesses: [[{ categoryName: "Right", score: 0.92 }]],
    } as never, 1234, 640, 480);

    expect(frame).toEqual({
      timestampMs: 1234,
      frameWidth: 640,
      frameHeight: 480,
      hands: [{
        landmarks,
        handedness: "Right",
        confidence: 0.92,
      }],
    });
  });

  it("prefers current handedness metadata over the deprecated compatibility field", () => {
    const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    const frame = handFrameFromResult({
      landmarks: [landmarks],
      handedness: [[{ categoryName: "Left", score: 0.8 }]],
      handednesses: [[{ categoryName: "Right", score: 0.9 }]],
    } as never, 10, 320, 240);

    expect(frame.hands[0]).toMatchObject({ handedness: "Left", confidence: 0.8 });
  });

  it.each([
    [Number.NaN, 640, 480],
    [Number.POSITIVE_INFINITY, 640, 480],
    [-1, 640, 480],
    [10, 0, 480],
    [10, 640, Number.NaN],
    [10, Number.POSITIVE_INFINITY, 480],
  ])("rejects invalid frame metadata", (timestampMs, frameWidth, frameHeight) => {
    expect(handFrameFromResult({ landmarks: [] } as never, timestampMs, frameWidth, frameHeight)).toBeNull();
  });

  it("preserves valid no-hand frames", () => {
    expect(handFrameFromResult({ landmarks: [] } as never, 10, 640, 480)).toEqual({
      timestampMs: 10,
      frameWidth: 640,
      frameHeight: 480,
      hands: [],
    });
  });

  it("drops incomplete hands while retaining metadata from each hand's original index", () => {
    const complete = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    const frame = handFrameFromResult({
      landmarks: [[{ x: 0.2, y: 0.3, z: -0.1 }], complete],
      handednesses: [
        [{ categoryName: "Left", score: 0.25 }],
        [{ categoryName: "Right", score: 0.75 }],
      ],
    } as never, 10, 320, 240);

    expect(frame?.hands).toEqual([{ landmarks: complete, handedness: "Right", confidence: 0.75 }]);
  });

  it("stops camera tracks, detaches the video, and closes the landmarker", () => {
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
    const stopTrack = vi.fn();
    const closeLandmarker = vi.fn();
    const pauseVideo = vi.fn();
    const video = { pause: pauseVideo, srcObject: { getTracks: () => [{ stop: stopTrack }] } } as unknown as HTMLVideoElement;
    const tracker = new HandTracker({ onFrame: vi.fn() });
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
