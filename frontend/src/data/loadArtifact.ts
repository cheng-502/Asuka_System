import type {
  KnowledgeSpaceArtifact,
  KnowledgeSpaceArtifactWire,
  KnowledgeSpaceNode,
  KnowledgeSpacePosition,
} from "./types";
import { validateArtifact } from "./validateArtifact";

export async function loadArtifact(
  url = "/data/knowledge-space.json",
  request: typeof fetch = fetch,
): Promise<KnowledgeSpaceArtifact> {
  const response = await request(url);
  if (!response.ok) {
    throw new Error(`Knowledge-space artifact request failed (${response.status})`);
  }

  return normalizeArtifact(validateArtifact(await response.json()));
}

export function normalizeArtifact(wire: KnowledgeSpaceArtifactWire): KnowledgeSpaceArtifact {
  if (wire.version === 1) {
    return {
      ...copyCommonMetadata(wire),
      version: 1,
      links: copyLinks(wire.links),
      nodes: wire.nodes.map((node): KnowledgeSpaceNode => {
        const semantic = copyPosition(node.position);
        return {
          ...node,
          position: copyPosition(semantic),
          layouts: {
            semantic,
            galaxy: copyPosition(node.position),
            compact: copyPosition(node.position),
          },
          hierarchy: null,
          is_virtual: false,
        };
      }),
      capabilities: { hierarchy: false, layouts: ["semantic"] },
    };
  }

  const realNodes = wire.nodes.map((node): KnowledgeSpaceNode => ({
    ...node,
    position: copyPosition(node.layouts.semantic),
    layouts: copyLayouts(node.layouts),
    hierarchy: { ...node.hierarchy },
    is_virtual: false,
  }));
  const virtualNodes = wire.virtual_nodes.map((node): KnowledgeSpaceNode => ({
    ...node,
    summary: "",
    domain: "virtual",
    position: copyPosition(node.layouts.semantic),
    layouts: copyLayouts(node.layouts),
    hierarchy: { ...node.hierarchy },
    explicit_link_count: 0,
    is_virtual: true,
  }));
  return {
    ...copyCommonMetadata(wire),
    version: 2,
    layout_generation: {
      version: wire.layout_generation.version,
      galaxy: { ...wire.layout_generation.galaxy },
      compact: { ...wire.layout_generation.compact },
    },
    relationships: { ...wire.relationships },
    links: copyLinks(wire.links),
    nodes: [...realNodes, ...virtualNodes],
    capabilities: {
      hierarchy: true,
      layouts: ["semantic", "galaxy", "compact"],
    },
  };
}

function copyCommonMetadata(wire: KnowledgeSpaceArtifactWire) {
  return {
    generated_at: wire.generated_at,
    pipeline: { ...wire.pipeline },
    embedding: { ...wire.embedding },
    umap: { ...wire.umap },
    source: { ...wire.source },
  };
}

function copyLinks(links: KnowledgeSpaceArtifactWire["links"]): KnowledgeSpaceArtifactWire["links"] {
  return links.map((link) => ({ ...link, types: [...link.types] }));
}

function copyLayouts(layouts: KnowledgeSpaceNode["layouts"]): KnowledgeSpaceNode["layouts"] {
  return {
    semantic: copyPosition(layouts.semantic),
    galaxy: copyPosition(layouts.galaxy),
    compact: copyPosition(layouts.compact),
  };
}

function copyPosition(position: KnowledgeSpacePosition): KnowledgeSpacePosition {
  return { x: position.x, y: position.y, z: position.z };
}
