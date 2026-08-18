export interface KnowledgeSpacePosition {
  x: number;
  y: number;
  z: number;
}

export interface KnowledgeSpaceNode {
  id: string;
  title: string;
  summary: string;
  domain: string;
  position: KnowledgeSpacePosition;
  explicit_link_count: number;
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

export interface KnowledgeSpaceArtifact {
  version: 1;
  generated_at: string;
  pipeline: {
    version: string;
  };
  embedding: {
    model: string;
    dimension: number;
    metric: "cosine";
    normalized: boolean;
  };
  umap: {
    n_components: 3;
    random_state: number;
    metric: "cosine";
  };
  source: {
    vault_hash: string;
    note_count: number;
  };
  nodes: KnowledgeSpaceNode[];
  links: KnowledgeSpaceLink[];
}
