import { describe, expect, it } from "vitest";
import fixture from "../../contracts/fixtures/knowledge-space.fixture.json";
import { selectedNodeLinks } from "../src/ui/DetailPanel";

describe("DetailPanel relationship selection", () => {
  it("returns the selected node's explicit links including unresolved targets", () => {
    const links = selectedNodeLinks(fixture, "01/目标检测.md", "wikilink");

    expect(links).toHaveLength(2);
    expect(links.every((link) => link.types.includes("wikilink"))).toBe(true);
  });

  it("sorts semantic links by similarity for the focused node", () => {
    const artifact = {
      ...fixture,
      links: [
        ...fixture.links,
        { source: "01/目标检测.md", target: "02/object-detection.md", types: ["semantic" as const], similarity: 0.86 },
      ],
    };

    expect(selectedNodeLinks(artifact, "01/目标检测.md", "semantic")[0].similarity).toBe(0.86);
  });
});
