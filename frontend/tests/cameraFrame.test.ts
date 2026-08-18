import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { calculateCameraFrame } from "../src/scene/cameraFrame";

describe("knowledge-space camera framing", () => {
  it("centers the external view on the node bounds and provides usable zoom limits", () => {
    const frame = calculateCameraFrame([
      new THREE.Vector3(2, 4, 6),
      new THREE.Vector3(18, 12, 14),
    ]);

    expect(frame.center.toArray()).toEqual([10, 8, 10]);
    expect(frame.distance).toBeGreaterThan(frame.minDistance);
    expect(frame.maxDistance).toBeGreaterThan(frame.distance);
    expect(frame.near).toBeGreaterThan(0);
    expect(frame.far).toBeGreaterThan(frame.maxDistance);
  });

  it("returns a stable default frame for an empty artifact", () => {
    const frame = calculateCameraFrame([]);

    expect(frame.center.toArray()).toEqual([0, 0, 0]);
    expect(frame.distance).toBe(8);
    expect(frame.minDistance).toBeLessThan(frame.distance);
  });
});
