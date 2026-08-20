import type { KnowledgeLayoutName, KnowledgeSpaceNode } from "../data/types";
import type { SceneEdge } from "./edges";

export interface EdgeVisibility {
  visible: boolean;
  opacity: number;
}

export function calculateEdgeVisibility(
  edges: readonly SceneEdge[],
  nodes: readonly KnowledgeSpaceNode[],
  selectedNodeId: string | null,
  layout: KnowledgeLayoutName,
  hierarchyAvailable: boolean,
): Map<string, EdgeVisibility> {
  const result = new Map<string, EdgeVisibility>();
  if (layout === "compact" && selectedNodeId === null) {
    edges.forEach((edge) => result.set(edge.id, { visible: false, opacity: 0 }));
    return result;
  }
  if (selectedNodeId === null) {
    edges.forEach((edge) => {
      const visible = edge.kind === "hierarchy"
        || (!hierarchyAvailable && (edge.kind === "wikilink" || edge.kind === "merged"));
      result.set(edge.id, { visible, opacity: visible ? 0.14 : 0 });
    });
    return result;
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const hierarchyIds = selectedHierarchyEdgeIds(selectedNodeId, nodeById);
  const semanticIds = new Set(
    edges
      .filter((edge) => edge.kind === "semantic" && (edge.source === selectedNodeId || edge.target === selectedNodeId))
      .sort((first, second) => (second.similarity ?? -1) - (first.similarity ?? -1) || first.id.localeCompare(second.id))
      .slice(0, 5)
      .map((edge) => edge.id),
  );
  const compactFactor = layout === "compact" ? 0.55 : 1;

  edges.forEach((edge) => {
    const incident = edge.source === selectedNodeId || edge.target === selectedNodeId;
    const highlighted = edge.kind === "hierarchy"
      ? hierarchyIds.has(edge.id)
      : edge.kind === "semantic"
        ? semanticIds.has(edge.id)
        : incident;
    const baseOpacity = edge.kind === "hierarchy" ? 0.62 : edge.kind === "semantic" ? 0.52 : 0.78;
    result.set(edge.id, { visible: highlighted, opacity: highlighted ? baseOpacity * compactFactor : 0 });
  });
  return result;
}

function selectedHierarchyEdgeIds(
  selectedNodeId: string,
  nodes: ReadonlyMap<string, KnowledgeSpaceNode>,
): Set<string> {
  const ids = new Set<string>();
  let current = nodes.get(selectedNodeId);
  const visited = new Set<string>();
  while (current?.hierarchy?.parent_id) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    ids.add(hierarchyEdgeId(current.hierarchy.parent_id, current.id));
    current = nodes.get(current.hierarchy.parent_id);
  }
  nodes.forEach((node) => {
    if (node.hierarchy?.parent_id === selectedNodeId) ids.add(hierarchyEdgeId(selectedNodeId, node.id));
  });
  return ids;
}

export function hierarchyEdgeId(parentId: string, childId: string): string {
  return `hierarchy:${parentId}->${childId}`;
}
