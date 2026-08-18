import * as THREE from "three";
import type { KnowledgeSpaceArtifact, KnowledgeSpaceNode } from "../data/types";

export type NodeMesh = THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;

const DOMAIN_COLORS = [0x67e8f9, 0x5eead4, 0xfcd34d, 0xfda4af, 0xc4b5fd, 0x93c5fd];
const NODE_BASE_RADIUS = 0.055;
const NODE_LINK_RADIUS = 0.006;
const NODE_MAX_LINKS = 12;

export function domainColor(domain: string): number {
  let hash = 0;
  for (const character of domain) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return DOMAIN_COLORS[hash % DOMAIN_COLORS.length];
}

export function createNodeMeshes(
  artifact: KnowledgeSpaceArtifact,
  group: THREE.Group,
): Map<string, NodeMesh> {
  const meshes = new Map<string, NodeMesh>();
  for (const node of artifact.nodes) {
    const mesh = createNodeMesh(node);
    group.add(mesh);
    meshes.set(node.id, mesh);
  }
  return meshes;
}

export function nodeRadius(explicitLinkCount: number): number {
  return NODE_BASE_RADIUS + Math.min(Math.max(explicitLinkCount, 0), NODE_MAX_LINKS) * NODE_LINK_RADIUS;
}

function createNodeMesh(node: KnowledgeSpaceNode): NodeMesh {
  const radius = nodeRadius(node.explicit_link_count);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 20, 14),
    new THREE.MeshStandardMaterial({
      color: domainColor(node.domain),
      emissive: domainColor(node.domain),
      emissiveIntensity: 0.28,
      roughness: 0.35,
      metalness: 0.15,
    }),
  );
  mesh.position.set(node.position.x, node.position.y, node.position.z);
  mesh.userData.nodeId = node.id;
  mesh.userData.baseScale = 1;
  return mesh;
}

export function setNodeState(mesh: NodeMesh, state: "idle" | "hover" | "selected"): void {
  const material = mesh.material;
  const baseScale = Number(mesh.userData.baseScale ?? 1);
  const scale = state === "selected" ? 1.45 : state === "hover" ? 1.18 : baseScale;
  mesh.scale.setScalar(scale);
  material.emissiveIntensity = state === "selected" ? 1.1 : state === "hover" ? 0.65 : 0.28;
}
