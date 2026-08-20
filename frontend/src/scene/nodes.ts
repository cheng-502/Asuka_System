import * as THREE from "three";
import type { KnowledgeSpaceArtifact, KnowledgeSpaceNode } from "../data/types";

export type NodeMesh = THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;

const DOMAIN_COLORS = [0x67e8f9, 0x5eead4, 0xfcd34d, 0xfda4af, 0xc4b5fd, 0x93c5fd];
const NODE_BASE_RADIUS = 0.055;
const NODE_LINK_RADIUS = 0.006;
const NODE_MAX_LINKS = 12;
export const MAX_ORDINARY_LABELS = 80;

export function domainColor(domain: string): number {
  let hash = 0;
  for (const character of domain) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return DOMAIN_COLORS[hash % DOMAIN_COLORS.length];
}

export function nodeColor(node: Pick<KnowledgeSpaceNode, "domain" | "is_virtual">): number {
  return node.is_virtual ? 0xf59e0b : domainColor(node.domain);
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
  const color = nodeColor(node);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 20, 14),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.28,
      roughness: 0.35,
      metalness: 0.15,
      wireframe: node.is_virtual,
    }),
  );
  mesh.position.set(node.position.x, node.position.y, node.position.z);
  mesh.userData.nodeId = node.id;
  mesh.userData.baseScale = 1;
  mesh.userData.isHub = node.hierarchy?.role === "hub";
  mesh.userData.isVirtual = node.is_virtual;
  mesh.userData.labelTitle = node.title;
  mesh.userData.labelRadius = radius;
  if (mesh.userData.isHub) ensureNodeLabel(mesh);
  return mesh;
}

export function setNodeState(mesh: NodeMesh, state: "idle" | "hover" | "selected"): void {
  const material = mesh.material;
  const baseScale = Number(mesh.userData.baseScale ?? 1);
  const scale = state === "selected" ? 1.45 : state === "hover" ? 1.18 : baseScale;
  mesh.scale.setScalar(scale);
  material.emissiveIntensity = state === "selected" ? 1.1 : state === "hover" ? 0.65 : 0.28;
}

export function updateNodeLabelVisibility(
  meshes: ReadonlyMap<string, NodeMesh>,
  camera: THREE.Camera,
  selectedNodeId: string | null,
  hoveredNodeId: string | null,
): void {
  let ordinaryLabels = 0;
  for (const forcedId of [selectedNodeId, hoveredNodeId]) {
    if (!forcedId) continue;
    const mesh = meshes.get(forcedId);
    if (mesh && !mesh.userData.isHub) {
      ensureNodeLabel(mesh).visible = true;
      ordinaryLabels += 1;
    }
  }
  meshes.forEach((mesh, nodeId) => {
    if (mesh.userData.isHub) {
      ensureNodeLabel(mesh).visible = true;
      return;
    }
    if (nodeId === selectedNodeId || nodeId === hoveredNodeId) return;
    const dx = camera.position.x - mesh.position.x;
    const dy = camera.position.y - mesh.position.y;
    const dz = camera.position.z - mesh.position.z;
    const nearby = dx * dx + dy * dy + dz * dz <= 64;
    if (nearby && ordinaryLabels < MAX_ORDINARY_LABELS) {
      ensureNodeLabel(mesh).visible = true;
      ordinaryLabels += 1;
    } else {
      removeNodeLabel(mesh);
    }
  });
}

export function setOrdinaryLabelOpacity(
  meshes: ReadonlyMap<string, NodeMesh>,
  opacity: number,
  selectedNodeId: string | null,
  hoveredNodeId: string | null,
): void {
  const clamped = Math.min(Math.max(opacity, 0), 1);
  meshes.forEach((mesh, nodeId) => {
    const label = mesh.userData.label as THREE.Sprite | undefined;
    if (!label) return;
    label.material.opacity = mesh.userData.isHub || nodeId === selectedNodeId || nodeId === hoveredNodeId
      ? 1
      : clamped;
  });
}

export function disposeNodeMesh(mesh: NodeMesh): void {
  mesh.traverse((object) => {
    if (object instanceof THREE.Sprite) {
      object.material.map?.dispose();
      object.material.dispose();
    }
  });
  mesh.geometry.dispose();
  mesh.material.dispose();
}

function createNodeLabel(title: string, radius: number, isHub: boolean): THREE.Sprite {
  if (typeof document === "undefined") {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
    sprite.position.set(0, radius + 0.11, 0);
    return sprite;
  }
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const displayTitle = title.length > 28 ? `${title.slice(0, 27)}…` : title;
  canvas.width = 256;
  canvas.height = 48;
  if (context) {
    context.font = `600 ${isHub ? 24 : 20}px system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.shadowColor = "rgba(2, 8, 23, 0.95)";
    context.shadowBlur = 8;
    context.fillStyle = isHub ? "#d8f8ff" : "#b9d8eb";
    context.fillText(displayTitle, canvas.width / 2, canvas.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  sprite.position.set(0, radius + 0.11, 0);
  sprite.scale.set(isHub ? 0.78 : 0.58, isHub ? 0.13 : 0.095, 1);
  sprite.renderOrder = 3;
  return sprite;
}

function ensureNodeLabel(mesh: NodeMesh): THREE.Sprite {
  const existing = mesh.userData.label as THREE.Sprite | undefined;
  if (existing) return existing;
  const label = createNodeLabel(
    String(mesh.userData.labelTitle ?? mesh.userData.nodeId ?? ""),
    Number(mesh.userData.labelRadius ?? NODE_BASE_RADIUS),
    Boolean(mesh.userData.isHub),
  );
  mesh.userData.label = label;
  mesh.add(label);
  return label;
}

function removeNodeLabel(mesh: NodeMesh): void {
  const label = mesh.userData.label as THREE.Sprite | undefined;
  if (!label || mesh.userData.isHub) return;
  mesh.remove(label);
  label.material.map?.dispose();
  label.material.dispose();
  delete mesh.userData.label;
}

export function countNodeLabels(meshes: ReadonlyMap<string, NodeMesh>): number {
  let count = 0;
  meshes.forEach((mesh) => {
    if (mesh.userData.label) count += 1;
  });
  return count;
}
