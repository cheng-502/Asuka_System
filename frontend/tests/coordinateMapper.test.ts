import { describe, expect, it } from "vitest";
import {
  displayPointToNdc,
  mapRawCameraPoint,
  mirrorCameraPoint,
  mirrorHandLandmarks,
} from "../src/hand/CoordinateMapper";

describe("raw camera coordinate mapping", () => {
  it.each([
    ["top-left", 0, 0, 640, 0, 1, 1],
    ["top-center", 0.5, 0, 320, 0, 0, 1],
    ["top-right", 1, 0, 0, 0, -1, 1],
    ["middle-left", 0, 0.5, 640, 240, 1, 0],
    ["center", 0.5, 0.5, 320, 240, 0, 0],
    ["middle-right", 1, 0.5, 0, 240, -1, 0],
    ["bottom-left", 0, 1, 640, 480, 1, -1],
    ["bottom-center", 0.5, 1, 320, 480, 0, -1],
    ["bottom-right", 1, 1, 0, 480, -1, -1],
  ])(
    "maps %s through selfie display, viewport, and NDC",
    (_label, rawX, rawY, viewportX, viewportY, ndcX, ndcY) => {
      expect(mapRawCameraPoint({ x: rawX, y: rawY }, 640, 480)).toEqual({
        display: { x: 1 - rawX, y: rawY },
        viewport: { x: viewportX, y: viewportY },
        ndc: { x: ndcX, y: ndcY },
      });
    },
  );

  it("mirrors only landmark x for gesture processing", () => {
    expect(mirrorHandLandmarks([{ x: 0.2, y: 0.3, z: -0.1 }])).toEqual([
      { x: 0.8, y: 0.3, z: -0.1 },
    ]);
  });

  it("clamps finite normalized coordinates at mapping boundaries", () => {
    expect(mirrorCameraPoint({ x: -0.25, y: 1.25 })).toEqual({ x: 1, y: 1 });
    expect(displayPointToNdc({ x: 1.25, y: -0.25 })).toEqual({ x: 1, y: 1 });
    expect(mapRawCameraPoint({ x: -0.25, y: 1.25 }, 640, 480)).toEqual({
      display: { x: 1, y: 1 },
      viewport: { x: 640, y: 480 },
      ndc: { x: 1, y: -1 },
    });
  });

  it("keeps mirrored hand landmark display coordinates within normalized bounds", () => {
    expect(mirrorHandLandmarks([{ x: -0.25, y: 1.25, z: -0.1 }])).toEqual([
      { x: 1, y: 1, z: -0.1 },
    ]);
  });

  it.each([
    [{ x: Number.NaN, y: 0.5 }],
    [{ x: 0.5, y: Number.POSITIVE_INFINITY }],
  ])("rejects non-finite normalized points consistently", (point) => {
    expect(() => mirrorCameraPoint(point)).toThrow(RangeError);
    expect(() => displayPointToNdc(point)).toThrow(RangeError);
    expect(() => mapRawCameraPoint(point, 640, 480)).toThrow(RangeError);
    expect(() => mirrorHandLandmarks([point])).toThrow(RangeError);
  });
});
