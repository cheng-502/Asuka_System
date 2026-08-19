import { describe, expect, it } from "vitest";
import { edgeVisualStyle } from "../src/scene/edges";
import { normalizedPointerToNdc } from "../src/scene/raycast";

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

  it("uses solid Wikilinks, dashed semantic links, and hides non-renderable links", () => {
    expect(edgeVisualStyle({ source: "a", target: "b", types: ["wikilink"] })).toBe("solid");
    expect(edgeVisualStyle({ source: "a", target: "b", types: ["semantic"], similarity: 0.8 })).toBe("dashed");
    expect(edgeVisualStyle({ source: "a", target: "b", types: ["wikilink", "semantic"], similarity: 0.8 })).toBe("solid");
    expect(edgeVisualStyle({ source: "a", target: "missing", types: ["wikilink"], is_unresolved: true, unresolved_target: "missing" })).toBe("hidden");
    expect(edgeVisualStyle({ source: "a", target: "a", types: ["wikilink"] })).toBe("hidden");
  });
});
