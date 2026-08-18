import type { KnowledgeSpaceArtifact } from "./types";
import { validateArtifact } from "./validateArtifact";

export async function loadArtifact(
  url = "/data/knowledge-space.json",
  request: typeof fetch = fetch,
): Promise<KnowledgeSpaceArtifact> {
  const response = await request(url);
  if (!response.ok) {
    throw new Error(`Knowledge-space artifact request failed (${response.status})`);
  }

  return validateArtifact(await response.json());
}
