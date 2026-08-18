import * as THREE from "three";
import type { KnowledgeSpaceArtifact, KnowledgeSpaceLink } from "../data/types";

export type EdgeVisualStyle = "solid" | "dashed" | "hidden";

export function edgeVisualStyle(link: KnowledgeSpaceLink): EdgeVisualStyle {
  if (link.is_unresolved || link.source === link.target) return "hidden";
  return link.types.includes("wikilink") ? "solid" : "dashed";
}

export function createRelationshipEdges(
  artifact: KnowledgeSpaceArtifact,
  nodeMeshes: Map<string, THREE.Object3D>,
  group: THREE.Group,
): void {
  for (const link of artifact.links) {
    const style = edgeVisualStyle(link);
    const source = nodeMeshes.get(link.source);
    const target = nodeMeshes.get(link.target);
    if (style === "hidden" || !source || !target) continue;

    const geometry = new THREE.BufferGeometry().setFromPoints([
      source.position,
      target.position,
    ]);
    const material = style === "solid"
      ? new THREE.LineBasicMaterial({ color: 0x6b9ac4, transparent: true, opacity: 0.42 })
      : new THREE.LineDashedMaterial({
          color: 0x9b8cff,
          transparent: true,
          opacity: 0.52,
          dashSize: 0.08,
          gapSize: 0.05,
        });
    const line = new THREE.Line(geometry, material);
    if (style === "dashed") line.computeLineDistances();
    line.userData.link = link;
    group.add(line);
  }
}
