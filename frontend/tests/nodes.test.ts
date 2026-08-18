import { describe, expect, it } from "vitest";
import { nodeRadius } from "../src/scene/nodes";

describe("knowledge-space node sizing", () => {
  it("keeps nodes compact while still reflecting explicit link count", () => {
    expect(nodeRadius(0)).toBeCloseTo(0.055);
    expect(nodeRadius(12)).toBeCloseTo(0.127);
    expect(nodeRadius(100)).toBeCloseTo(nodeRadius(12));
    expect(nodeRadius(12)).toBeLessThan(0.15);
  });
});
