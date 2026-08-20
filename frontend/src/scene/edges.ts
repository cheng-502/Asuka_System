import * as THREE from "three";
import type { KnowledgeSpaceArtifact, KnowledgeSpaceLink } from "../data/types";
import { hierarchyEdgeId } from "./visibility";
import { domainColor } from "./nodes";

export type EdgeVisualStyle = "hierarchy" | "solid" | "dashed" | "merged" | "hidden";
export type EdgeKind = "hierarchy" | "wikilink" | "semantic" | "merged";

interface EdgeBatch {
  line: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial | THREE.LineDashedMaterial>;
  positions: Float32Array;
  distances: Float32Array | null;
  colors: Float32Array | null;
  visibleCount: number;
}

export interface SceneEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  similarity?: number;
  line: EdgeBatch["line"];
  positionValues: Float32Array;
  distanceValues: Float32Array | null;
  colorValues: Float32Array | null;
  slot: number;
  visible: boolean;
  batch: EdgeBatch;
}

interface EdgeDescriptor {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  similarity?: number;
  color?: number;
}

export function edgeVisualStyle(link: KnowledgeSpaceLink): EdgeVisualStyle {
  if (link.is_unresolved || link.source === link.target) return "hidden";
  if (link.types.includes("wikilink") && link.types.includes("semantic")) return "merged";
  return link.types.includes("wikilink") ? "solid" : "dashed";
}

export function createDynamicEdges(
  artifact: KnowledgeSpaceArtifact,
  nodeMeshes: ReadonlyMap<string, THREE.Object3D>,
  group: THREE.Group,
): SceneEdge[] {
  const descriptors: EdgeDescriptor[] = [];
  if (artifact.capabilities.hierarchy) {
    artifact.nodes.forEach((node) => {
      const parentId = node.hierarchy?.parent_id;
      if (parentId && nodeMeshes.has(parentId) && nodeMeshes.has(node.id)) {
        descriptors.push({
          id: hierarchyEdgeId(parentId, node.id),
          source: parentId,
          target: node.id,
          kind: "hierarchy",
          color: domainColor(node.hierarchy?.topic_root_id ?? parentId),
        });
      }
    });
  }
  artifact.links.forEach((link, index) => {
    const style = edgeVisualStyle(link);
    if (style === "hidden" || !nodeMeshes.has(link.source) || !nodeMeshes.has(link.target)) return;
    descriptors.push({
      id: `relationship:${index}:${link.source}->${link.target}`,
      source: link.source,
      target: link.target,
      kind: style === "solid" ? "wikilink" : style === "dashed" ? "semantic" : "merged",
      similarity: link.similarity,
    });
  });

  const edges: SceneEdge[] = [];
  for (const kind of ["hierarchy", "wikilink", "semantic", "merged"] as const) {
    const matching = descriptors.filter((descriptor) => descriptor.kind === kind);
    if (!matching.length) continue;
    const batch = createBatch(kind, matching.length);
    group.add(batch.line);
    matching.forEach((descriptor, slot) => {
      const colorValues = batch.colors?.subarray(slot * 6, slot * 6 + 6) ?? null;
      if (colorValues) {
        const color = new THREE.Color(descriptor.color ?? 0x3f718c);
        color.toArray(colorValues, 0);
        color.toArray(colorValues, 3);
      }
      edges.push({
        ...descriptor,
        line: batch.line,
        positionValues: batch.positions.subarray(slot * 6, slot * 6 + 6),
        distanceValues: batch.distances?.subarray(slot * 2, slot * 2 + 2) ?? null,
        colorValues,
        slot,
        visible: false,
        batch,
      });
    });
  }
  return edges;
}

export function updateDynamicEdges(
  edges: readonly SceneEdge[],
  nodeMeshes: ReadonlyMap<string, THREE.Object3D>,
  includeHidden = false,
): number {
  let updated = 0;
  const touched = new Set<EdgeBatch>();
  edges.forEach((edge) => {
    if (!includeHidden && !edge.visible) return;
    const source = nodeMeshes.get(edge.source);
    const target = nodeMeshes.get(edge.target);
    if (!source || !target) {
      edge.visible = false;
      collapseEdge(edge);
      touched.add(edge.batch);
      return;
    }
    const values = edge.positionValues;
    values[0] = source.position.x; values[1] = source.position.y; values[2] = source.position.z;
    values[3] = target.position.x; values[4] = target.position.y; values[5] = target.position.z;
    if (edge.distanceValues) {
      const dx = values[3] - values[0];
      const dy = values[4] - values[1];
      const dz = values[5] - values[2];
      edge.distanceValues[0] = 0;
      edge.distanceValues[1] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    touched.add(edge.batch);
    updated += 1;
  });
  touched.forEach(markBatchUpdated);
  return updated;
}

export function applyEdgeVisibility(
  edges: readonly SceneEdge[],
  visibility: ReadonlyMap<string, { visible: boolean; opacity: number }>,
): void {
  const batches = new Set<EdgeBatch>();
  edges.forEach((edge) => {
    const state = visibility.get(edge.id);
    edge.visible = state?.visible ?? false;
    batches.add(edge.batch);
    if (!edge.visible) collapseEdge(edge);
  });
  batches.forEach((batch) => {
    const batchEdges = edges.filter((edge) => edge.batch === batch);
    batch.visibleCount = batchEdges.filter((edge) => edge.visible).length;
    batch.line.visible = batch.visibleCount > 0;
    batch.line.material.opacity = batchEdges.reduce(
      (maximum, edge) => Math.max(maximum, visibility.get(edge.id)?.opacity ?? 0),
      0,
    );
    batch.line.userData.baseOpacity = batch.line.material.opacity;
    markBatchUpdated(batch);
  });
}

export function setEdgeOpacityFactor(edges: readonly SceneEdge[], factor: number): void {
  const clamped = Math.min(Math.max(factor, 0), 1);
  const batches = new Set(edges.map((edge) => edge.batch));
  batches.forEach((batch) => {
    batch.line.material.opacity = Number(batch.line.userData.baseOpacity ?? batch.line.material.opacity) * clamped;
  });
}

function createBatch(kind: EdgeKind, count: number): EdgeBatch {
  const positions = new Float32Array(count * 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const dashed = kind === "semantic";
  const material = dashed
    ? new THREE.LineDashedMaterial({ color: 0x9b8cff, transparent: true, opacity: 0, dashSize: 0.08, gapSize: 0.05 })
    : new THREE.LineBasicMaterial({
        color: kind === "hierarchy" ? 0xffffff : kind === "merged" ? 0x76d6d0 : 0x6b9ac4,
        vertexColors: kind === "hierarchy",
        transparent: true,
        opacity: 0,
      });
  const distances = dashed ? new Float32Array(count * 2) : null;
  const colors = kind === "hierarchy" ? new Float32Array(count * 6) : null;
  if (distances) geometry.setAttribute("lineDistance", new THREE.BufferAttribute(distances, 1));
  if (colors) geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const line = new THREE.LineSegments(geometry, material);
  line.frustumCulled = false;
  line.visible = false;
  line.userData.edgeKind = kind;
  return { line, positions, distances, colors, visibleCount: 0 };
}

function collapseEdge(edge: SceneEdge): void {
  edge.positionValues.fill(0);
  edge.distanceValues?.fill(0);
}

function markBatchUpdated(batch: EdgeBatch): void {
  batch.line.geometry.attributes.position.needsUpdate = true;
  if (batch.distances) batch.line.geometry.attributes.lineDistance.needsUpdate = true;
}
