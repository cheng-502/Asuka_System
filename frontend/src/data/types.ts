export interface KnowledgeSpacePosition {
  x: number;
  y: number;
  z: number;
}

export type KnowledgeLayoutName = "semantic" | "galaxy" | "compact";

export interface KnowledgeSpaceLayouts {
  semantic: KnowledgeSpacePosition;
  galaxy: KnowledgeSpacePosition;
  compact: KnowledgeSpacePosition;
}

export type HierarchyRole = "hub" | "note";
export type HierarchyAssignment = "explicit" | "wikilink" | "folder" | "semantic" | "unassigned";

export interface KnowledgeHierarchy {
  role: HierarchyRole;
  parent_id: string | null;
  depth: number;
  assignment: HierarchyAssignment;
  topic_root_id: string;
}

export interface KnowledgeSpaceNodeV1Wire {
  id: string;
  title: string;
  summary: string;
  domain: string;
  position: KnowledgeSpacePosition;
  explicit_link_count: number;
}

export interface KnowledgeSpaceNodeV2Wire {
  id: string;
  title: string;
  summary: string;
  domain: string;
  layouts: KnowledgeSpaceLayouts;
  hierarchy: KnowledgeHierarchy;
  explicit_link_count: number;
}

export interface VirtualKnowledgeNodeV2Wire {
  id: string;
  title: string;
  layouts: KnowledgeSpaceLayouts;
  hierarchy: KnowledgeHierarchy;
}

export interface KnowledgeSpaceNode {
  id: string;
  title: string;
  summary: string;
  domain: string;
  position: KnowledgeSpacePosition;
  layouts: KnowledgeSpaceLayouts;
  hierarchy: KnowledgeHierarchy | null;
  explicit_link_count: number;
  is_virtual: boolean;
}

export type RelationType = "wikilink" | "semantic";

export interface KnowledgeSpaceLink {
  source: string;
  target: string;
  types: RelationType[];
  similarity?: number;
  is_unresolved?: boolean;
  unresolved_target?: string;
}

interface CommonArtifactWire {
  generated_at: string;
  pipeline: { version: string };
  embedding: {
    model: string;
    dimension: number;
    metric: "cosine";
    normalized: boolean;
    revision?: string;
    device?: string;
    runtime_device?: string;
  };
  umap: {
    n_components: 3;
    random_state: number;
    metric: "cosine";
    n_neighbors?: number;
    min_dist?: number;
  };
  source: {
    vault_hash: string;
    note_count: number;
  };
  links: KnowledgeSpaceLink[];
}

export interface KnowledgeSpaceArtifactV1Wire extends CommonArtifactWire {
  version: 1;
  nodes: KnowledgeSpaceNodeV1Wire[];
}

export interface LayoutGenerationV2 {
  version: string;
  galaxy: { algorithm: string; seed: number };
  compact: { algorithm: string; seed: number };
}

export interface RelationshipGenerationV2 {
  max_neighbors: number;
  min_similarity: number | null;
  hierarchy_min_similarity: number;
}

export interface KnowledgeSpaceArtifactV2Wire extends CommonArtifactWire {
  version: 2;
  layout_generation: LayoutGenerationV2;
  relationships: RelationshipGenerationV2;
  nodes: KnowledgeSpaceNodeV2Wire[];
  virtual_nodes: VirtualKnowledgeNodeV2Wire[];
}

export type KnowledgeSpaceArtifactWire = KnowledgeSpaceArtifactV1Wire | KnowledgeSpaceArtifactV2Wire;

export interface KnowledgeSpaceArtifact extends CommonArtifactWire {
  version: 1 | 2;
  layout_generation?: LayoutGenerationV2;
  relationships?: RelationshipGenerationV2;
  nodes: KnowledgeSpaceNode[];
  capabilities: {
    hierarchy: boolean;
    layouts: KnowledgeLayoutName[];
  };
}
