import { describe, expect, it } from "vitest";
import * as THREE from "three";
import fixture from "../../contracts/fixtures/knowledge-space-v2.fixture.json";
import { normalizeArtifact } from "../src/data/loadArtifact";
import type { KnowledgeSpaceNode } from "../src/data/types";
import {
  applyEdgeVisibility,
  createDynamicEdges,
  setEdgeOpacityFactor,
  updateDynamicEdges,
  type EdgeKind,
  type SceneEdge,
} from "../src/scene/edges";
import { calculateEdgeVisibility, hierarchyEdgeId } from "../src/scene/visibility";

describe("dynamic knowledge edges", () => {
  it("derives hierarchy edges and reuses geometry buffers while nodes move", () => {
    const artifact = normalizeArtifact(structuredClone(fixture));
    const meshes = new Map(
      artifact.nodes.map((node) => {
        const object = new THREE.Object3D();
        object.position.set(node.position.x, node.position.y, node.position.z);
        return [node.id, object] as const;
      }),
    );
    const group = new THREE.Group();
    const edges = createDynamicEdges(artifact, meshes, group);
    const hierarchy = edges.filter((edge) => edge.kind === "hierarchy");
    const moving = hierarchy[0];
    const geometry = moving.line.geometry;
    const positionAttribute = geometry.attributes.position;
    const positionValues = moving.positionValues;

    moving.visible = true;
    meshes.get(moving.target)!.position.set(9, 8, 7);
    updateDynamicEdges(edges, meshes);

    expect(hierarchy).toHaveLength(3);
    expect(group.children.length).toBeLessThanOrEqual(4);
    expect(moving.line.geometry).toBe(geometry);
    expect(moving.line.geometry.attributes.position).toBe(positionAttribute);
    expect(moving.positionValues).toBe(positionValues);
    expect(Array.from(positionValues.slice(3))).toEqual([9, 8, 7]);
    const topicColors = hierarchy.map((edge) => Array.from(edge.colorValues ?? []));
    expect(new Set(topicColors.map((color) => color.join(","))).size).toBeGreaterThan(1);
  });

  it("batches 1,000 hierarchy edges and updates only visible slots per frame", () => {
    const nodes = [node("hub", "hub", null, 0, "hub")];
    nodes.push(...Array.from({ length: 999 }, (_, index) => node(`note-${index}`, "note", "hub", 1, "hub")));
    const artifact = {
      nodes,
      links: [],
      capabilities: { hierarchy: true, layouts: ["semantic", "galaxy", "compact"] },
    } as unknown as Parameters<typeof createDynamicEdges>[0];
    const meshes = new Map(nodes.map((item) => [item.id, new THREE.Object3D()]));
    const group = new THREE.Group();
    const edges = createDynamicEdges(artifact, meshes, group);
    const visibility = new Map(edges.map((edge, index) => [edge.id, { visible: index < 10, opacity: 0.2 }]));
    applyEdgeVisibility(edges, visibility);

    const updated = updateDynamicEdges(edges, meshes);

    expect(edges).toHaveLength(999);
    expect(group.children).toHaveLength(1);
    expect(updated).toBe(10);
    expect(new Set(edges.map((edge) => edge.line.geometry)).size).toBe(1);
    expect(new Set(edges.map((edge) => edge.line.material)).size).toBe(1);
  });

  it("applies reversible transition opacity without losing the visibility baseline", () => {
    const artifact = normalizeArtifact(structuredClone(fixture));
    const meshes = new Map(artifact.nodes.map((item) => [item.id, new THREE.Object3D()]));
    const edges = createDynamicEdges(artifact, meshes, new THREE.Group());
    const visibility = new Map(edges.map((edge) => [edge.id, { visible: true, opacity: 0.4 }]));
    applyEdgeVisibility(edges, visibility);

    setEdgeOpacityFactor(edges, 0.25);
    expect(edges[0].line.material.opacity).toBeCloseTo(0.1);
    setEdgeOpacityFactor(edges, 1);
    expect(edges[0].line.material.opacity).toBeCloseTo(0.4);
  });

  it("skips missing child endpoints and collapses endpoints removed at runtime", () => {
    const artifact = normalizeArtifact(structuredClone(fixture));
    const meshes = new Map(artifact.nodes.map((item) => [item.id, new THREE.Object3D()]));
    const missingChildId = artifact.nodes.find((item) => item.hierarchy?.parent_id)?.id as string;
    meshes.delete(missingChildId);
    const edges = createDynamicEdges(artifact, meshes, new THREE.Group());
    expect(edges.some((edge) => edge.target === missingChildId)).toBe(false);

    const runtimeEdge = edges[0];
    runtimeEdge.visible = true;
    meshes.delete(runtimeEdge.target);
    updateDynamicEdges([runtimeEdge], meshes);
    expect(runtimeEdge.visible).toBe(false);
    expect(Array.from(runtimeEdge.positionValues)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("shows idle hierarchy and selected parent/child, Wikilink, and Top-5 semantics", () => {
    const nodes = [
      node("root", "hub", null, 0, "root"),
      node("parent", "hub", "root", 1, "root"),
      node("selected", "note", "parent", 2, "root"),
      node("child", "note", "selected", 3, "root"),
      ...Array.from({ length: 6 }, (_, index) => node(`semantic-${index}`, "note", "parent", 2, "root")),
    ];
    const edges = [
      fakeEdge(hierarchyEdgeId("root", "parent"), "root", "parent", "hierarchy"),
      fakeEdge(hierarchyEdgeId("parent", "selected"), "parent", "selected", "hierarchy"),
      fakeEdge(hierarchyEdgeId("selected", "child"), "selected", "child", "hierarchy"),
      fakeEdge("wiki", "selected", "child", "wikilink"),
      fakeEdge("other-wiki", "root", "child", "wikilink"),
      ...Array.from({ length: 6 }, (_, index) =>
        fakeEdge(`semantic-${index}`, "selected", `semantic-${index}`, "semantic", 0.9 - index * 0.05),
      ),
    ];

    const idle = calculateEdgeVisibility(edges, nodes, null, "galaxy", true);
    expect(idle.get(hierarchyEdgeId("root", "parent"))?.visible).toBe(true);
    expect(idle.get("wiki")?.visible).toBe(false);
    const legacyIdle = calculateEdgeVisibility(
      [...edges, fakeEdge("merged", "root", "child", "merged", 0.8)],
      nodes,
      null,
      "semantic",
      false,
    );
    expect(legacyIdle.get("wiki")?.visible).toBe(true);
    expect(legacyIdle.get("merged")?.visible).toBe(true);

    const selected = calculateEdgeVisibility(edges, nodes, "selected", "galaxy", true);
    expect(selected.get(hierarchyEdgeId("root", "parent"))?.visible).toBe(true);
    expect(selected.get(hierarchyEdgeId("selected", "child"))?.visible).toBe(true);
    expect(selected.get("wiki")?.visible).toBe(true);
    expect(selected.get("other-wiki")?.visible).toBe(false);
    expect(selected.get("semantic-4")?.visible).toBe(true);
    expect(selected.get("semantic-5")?.visible).toBe(false);

    const compact = calculateEdgeVisibility(edges, nodes, "selected", "compact", true);
    expect(compact.get("wiki")!.opacity).toBeLessThan(selected.get("wiki")!.opacity);
    expect(calculateEdgeVisibility(edges, nodes, null, "compact", true).get("wiki")?.visible).toBe(false);
  });
});

function node(
  id: string,
  role: "hub" | "note",
  parent_id: string | null,
  depth: number,
  topic_root_id: string,
): KnowledgeSpaceNode {
  const point = { x: 0, y: 0, z: 0 };
  return {
    id,
    title: id,
    summary: "",
    domain: "test",
    position: { ...point },
    layouts: { semantic: { ...point }, galaxy: { ...point }, compact: { ...point } },
    hierarchy: { role, parent_id, depth, assignment: "explicit", topic_root_id },
    explicit_link_count: 0,
    is_virtual: false,
  };
}

function fakeEdge(
  id: string,
  source: string,
  target: string,
  kind: EdgeKind,
  similarity?: number,
): SceneEdge {
  return {
    id,
    source,
    target,
    kind,
    similarity,
    line: new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()),
    positionValues: new Float32Array(6),
    distanceValues: null,
    colorValues: null,
    slot: 0,
    visible: false,
    batch: {},
  } as unknown as SceneEdge;
}
