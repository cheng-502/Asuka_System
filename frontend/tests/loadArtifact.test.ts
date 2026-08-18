import { describe, expect, it } from "vitest";
import fixture from "../../contracts/fixtures/knowledge-space.fixture.json";
import { loadArtifact } from "../src/data/loadArtifact";

describe("loadArtifact", () => {
  it("fetches and validates the browser artifact", async () => {
    const request: typeof fetch = async () =>
      new Response(JSON.stringify(fixture), { status: 200 });

    await expect(loadArtifact("/fixture.json", request)).resolves.toEqual(fixture);
  });

  it("reports a failed artifact request", async () => {
    const request: typeof fetch = async () => new Response("missing", { status: 404 });

    await expect(loadArtifact("/missing.json", request)).rejects.toThrow("404");
  });
});
