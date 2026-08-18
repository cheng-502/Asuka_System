import { describe, expect, it } from "vitest";
import fixture from "../../contracts/fixtures/knowledge-space.fixture.json";
import { ArtifactValidationError, validateArtifact } from "../src/data/validateArtifact";

function validArtifact() {
  return {
    version: 1,
    generated_at: "2026-08-18T12:00:00Z",
    pipeline: { version: "mvp1.0.0" },
    embedding: {
      model: "BAAI/bge-m3",
      dimension: 1024,
      metric: "cosine",
      normalized: true,
    },
    umap: { n_components: 3, random_state: 42, metric: "cosine" },
    source: { vault_hash: "a".repeat(64), note_count: 2 },
    nodes: [
      {
        id: "01/目标检测.md",
        title: "目标检测",
        summary: "Object detection notes.",
        domain: "01",
        position: { x: 0.1, y: -0.2, z: 0.3 },
        explicit_link_count: 1,
      },
      {
        id: "02/object-detection.md",
        title: "object detection",
        summary: "Cross-language concept.",
        domain: "02",
        position: { x: -0.1, y: 0.2, z: -0.3 },
        explicit_link_count: 0,
      },
    ],
    links: [
      {
        source: "01/目标检测.md",
        target: "02/object-detection.md",
        types: ["wikilink", "semantic"],
        similarity: 0.86,
        is_unresolved: false,
      },
      {
        source: "01/目标检测.md",
        target: "missing-note",
        types: ["wikilink"],
        is_unresolved: true,
        unresolved_target: "missing-note",
      },
    ],
  };
}

describe("validateArtifact", () => {
  it("validates the shared fixture", () => {
    expect(validateArtifact(fixture)).toEqual(fixture);
  });

  it("accepts a valid artifact with merged and unresolved links", () => {
    expect(validateArtifact(validArtifact())).toEqual(validArtifact());
  });

  it("allows a resolved link without optional unresolved metadata", () => {
    const artifact = validArtifact();
    delete artifact.links[0].is_unresolved;

    expect(validateArtifact(artifact)).toEqual(artifact);
  });

  it("rejects missing required metadata", () => {
    const artifact = validArtifact();
    delete (artifact as { embedding?: unknown }).embedding;

    expect(() => validateArtifact(artifact)).toThrow(ArtifactValidationError);
  });

  it("rejects invalid coordinates", () => {
    const artifact = validArtifact();
    artifact.nodes[0].position.z = "not-a-number" as unknown as number;

    expect(() => validateArtifact(artifact)).toThrow(ArtifactValidationError);
  });

  it("rejects an unknown resolved relation target", () => {
    const artifact = validArtifact();
    artifact.links[0].target = "not-a-node";

    expect(() => validateArtifact(artifact)).toThrow(ArtifactValidationError);
  });
});
