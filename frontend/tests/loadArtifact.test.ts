import { describe, expect, it } from "vitest";
import fixture from "../../contracts/fixtures/knowledge-space.fixture.json";
import v2Fixture from "../../contracts/fixtures/knowledge-space-v2.fixture.json";
import { loadArtifact, normalizeArtifact } from "../src/data/loadArtifact";

describe("loadArtifact", () => {
  it("normalizes v1 into semantic-only runtime data", async () => {
    const request: typeof fetch = async () =>
      new Response(JSON.stringify(fixture), { status: 200 });

    const artifact = await loadArtifact("/fixture.json", request);

    expect(artifact.version).toBe(1);
    expect(artifact.capabilities).toEqual({ hierarchy: false, layouts: ["semantic"] });
    expect(artifact.nodes[0]).toMatchObject({
      position: fixture.nodes[0].position,
      layouts: {
        semantic: fixture.nodes[0].position,
        galaxy: fixture.nodes[0].position,
        compact: fixture.nodes[0].position,
      },
      hierarchy: null,
      is_virtual: false,
    });
  });

  it("normalizes v2 semantic positions and virtual hubs", async () => {
    const request: typeof fetch = async () =>
      new Response(JSON.stringify(v2Fixture), { status: 200 });

    const artifact = await loadArtifact("/fixture-v2.json", request);

    expect(artifact.version).toBe(2);
    expect(artifact.capabilities).toEqual({
      hierarchy: true,
      layouts: ["semantic", "galaxy", "compact"],
    });
    expect(artifact.nodes).toHaveLength(v2Fixture.nodes.length + v2Fixture.virtual_nodes.length);
    expect(artifact).not.toHaveProperty("virtual_nodes");
    expect(artifact.nodes[0].position).toEqual(v2Fixture.nodes[0].layouts.semantic);
    expect(artifact.nodes.at(-1)).toMatchObject({
      id: "virtual:unassigned",
      summary: "",
      domain: "virtual",
      explicit_link_count: 0,
      is_virtual: true,
    });
  });

  it("creates an independent runtime graph without wire-only collections", () => {
    const wire = structuredClone(v2Fixture);
    const artifact = normalizeArtifact(wire);

    expect(artifact).not.toHaveProperty("virtual_nodes");
    expect(artifact.nodes[0].position).not.toBe(wire.nodes[0].layouts.semantic);
    expect(artifact.nodes[0].layouts.semantic).not.toBe(wire.nodes[0].layouts.semantic);
    expect(artifact.nodes[0].position).not.toBe(artifact.nodes[0].layouts.semantic);
    expect(artifact.links).not.toBe(wire.links);

    wire.nodes[0].layouts.semantic.x = 999;
    wire.links[0].types.push("semantic");
    wire.source.note_count = 999;
    wire.layout_generation.galaxy.seed = 999;

    expect(artifact.nodes[0].position.x).not.toBe(999);
    expect(artifact.links[0].types).toEqual(["wikilink"]);
    expect(artifact.source.note_count).toBe(v2Fixture.source.note_count);
    expect(artifact.layout_generation?.galaxy.seed).toBe(v2Fixture.layout_generation.galaxy.seed);
  });

  it("isolates v1 runtime metadata from the wire payload", () => {
    const wire = structuredClone(fixture);
    const artifact = normalizeArtifact(wire);

    wire.embedding.model = "changed";
    wire.umap.random_state = 999;
    wire.source.note_count = 999;

    expect(artifact.embedding.model).toBe(fixture.embedding.model);
    expect(artifact.umap.random_state).toBe(fixture.umap.random_state);
    expect(artifact.source.note_count).toBe(fixture.source.note_count);
  });

  it("reports a failed artifact request", async () => {
    const request: typeof fetch = async () => new Response("missing", { status: 404 });

    await expect(loadArtifact("/missing.json", request)).rejects.toThrow("404");
  });
});
