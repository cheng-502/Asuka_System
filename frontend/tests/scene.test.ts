import { describe, expect, it, vi } from "vitest";
import { edgeVisualStyle } from "../src/scene/edges";
import { nextPinchSelection, normalizedPointerToNdc } from "../src/scene/raycast";
import { handZoomScale, KnowledgeScene } from "../src/scene/KnowledgeScene";

describe("scene interaction helpers", () => {
  it("maps normalized screen coordinates to Three.js NDC", () => {
    expect(normalizedPointerToNdc(0, 0)).toEqual({ x: -1, y: 1 });
    expect(normalizedPointerToNdc(0.5, 0.5)).toEqual({ x: 0, y: 0 });
    expect(normalizedPointerToNdc(1, 1)).toEqual({ x: 1, y: -1 });
  });

  it("clamps finite pointer coordinates and rejects non-finite values", () => {
    expect(normalizedPointerToNdc(-0.5, 1.5)).toEqual({ x: -1, y: -1 });
    expect(() => normalizedPointerToNdc(Number.NaN, 0.5)).toThrow(RangeError);
  });

  it("preserves the current selection when a pinch lands on empty space", () => {
    expect(nextPinchSelection("selected-note", null)).toBe("selected-note");
    expect(nextPinchSelection("selected-note", "hovered-note")).toBe("hovered-note");
    expect(nextPinchSelection(null, null)).toBeNull();
  });

  it("converts hand zoom log deltas to an exact multiplicative dolly scale", () => {
    expect(handZoomScale(Math.log(2))).toBeCloseTo(2);
    expect(handZoomScale(-Math.log(3))).toBeCloseTo(3);
    expect(handZoomScale(0)).toBe(1);
  });

  it("applies exact hand transform units without OrbitControls damping gain", () => {
    const cameraPosition = {
      x: 1, y: 2, z: 3,
      clone: () => ({ x: 1, y: 2, z: 3 }),
      copy: vi.fn(function (value: { x: number; y: number; z: number }) { Object.assign(this, value); }),
    };
    const target = {
      x: 4, y: 5, z: 6,
      clone: () => ({ x: 4, y: 5, z: 6 }),
      copy: vi.fn(function (value: { x: number; y: number; z: number }) { Object.assign(this, value); }),
    };
    const controls = {
      object: { position: cameraPosition, zoom: 1, updateProjectionMatrix: vi.fn() },
      target,
      enabled: true,
      enableDamping: true,
      dollyIn: vi.fn(),
      dollyOut: vi.fn(),
      rotateLeft: vi.fn(),
      update: vi.fn(() => { cameraPosition.x += 10; target.x += 10; }),
    };
    const scene = Object.create(KnowledgeScene.prototype) as KnowledgeScene;
    Object.assign(scene, { controls, camera: controls.object });

    scene.beginHandTransform();
    scene.applyHandTransform(Math.log(2), 0.25);
    scene.endHandTransform();

    expect(controls.dollyIn).toHaveBeenCalledWith(2);
    expect(controls.dollyOut).not.toHaveBeenCalled();
    expect(controls.rotateLeft).toHaveBeenCalledWith(0.25);
    expect(cameraPosition.x).toBe(1);
    expect(target.x).toBe(4);
    expect(controls.update).toHaveBeenCalledTimes(1);
    expect(controls.enabled).toBe(true);
    expect(controls.enableDamping).toBe(true);
  });

  it("uses solid Wikilinks, dashed semantic links, and hides non-renderable links", () => {
    expect(edgeVisualStyle({ source: "a", target: "b", types: ["wikilink"] })).toBe("solid");
    expect(edgeVisualStyle({ source: "a", target: "b", types: ["semantic"], similarity: 0.8 })).toBe("dashed");
    expect(edgeVisualStyle({ source: "a", target: "b", types: ["wikilink", "semantic"], similarity: 0.8 })).toBe("solid");
    expect(edgeVisualStyle({ source: "a", target: "missing", types: ["wikilink"], is_unresolved: true, unresolved_target: "missing" })).toBe("hidden");
    expect(edgeVisualStyle({ source: "a", target: "a", types: ["wikilink"] })).toBe("hidden");
  });
});
