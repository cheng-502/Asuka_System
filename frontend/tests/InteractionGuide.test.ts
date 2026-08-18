import { describe, expect, it } from "vitest";
import { INTERACTION_GUIDE } from "../src/ui/InteractionGuide";

describe("interaction guide", () => {
  it("documents every MVP-1 hand command and the mouse fallback", () => {
    expect(INTERACTION_GUIDE.map((item) => item.label)).toEqual([
      "Pointer",
      "Pinch",
      "Open Palm",
      "Zoom",
      "Rotate",
      "No Hand",
      "Mouse",
    ]);
    expect(INTERACTION_GUIDE.find((item) => item.label === "No Hand")?.description).toContain("15s");
    expect(INTERACTION_GUIDE.find((item) => item.label === "Mouse")?.description).toContain("滚轮");
  });
});
