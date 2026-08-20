import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  countNodeLabels,
  MAX_ORDINARY_LABELS,
  nodeColor,
  nodeRadius,
  updateNodeLabelVisibility,
  type NodeMesh,
} from "../src/scene/nodes";

describe("knowledge-space node sizing", () => {
  it("keeps nodes compact while still reflecting explicit link count", () => {
    expect(nodeRadius(0)).toBeCloseTo(0.055);
    expect(nodeRadius(12)).toBeCloseTo(0.127);
    expect(nodeRadius(100)).toBeCloseTo(nodeRadius(12));
    expect(nodeRadius(12)).toBeLessThan(0.15);
  });

  it("keeps hub labels visible while applying distance LOD to ordinary notes", () => {
    const hub = labeledMesh(true, 100);
    const nearNote = labeledMesh(false, 2);
    const farNote = labeledMesh(false, 100);
    const meshes = new Map([["hub", hub], ["near", nearNote], ["far", farNote]]);
    const camera = new THREE.PerspectiveCamera();

    updateNodeLabelVisibility(meshes, camera, "far", null);

    expect((hub.userData.label as THREE.Sprite).visible).toBe(true);
    expect((nearNote.userData.label as THREE.Sprite).visible).toBe(true);
    expect((farNote.userData.label as THREE.Sprite).visible).toBe(true);
    updateNodeLabelVisibility(meshes, camera, null, null);
    expect(farNote.userData.label).toBeUndefined();
  });

  it("caps resident ordinary label resources for 1,000 nearby notes", () => {
    const meshes = new Map<string, NodeMesh>();
    for (let index = 0; index < 1000; index += 1) {
      const mesh = labeledMesh(false, 2);
      delete mesh.userData.label;
      mesh.clear();
      mesh.userData.labelTitle = `Note ${index}`;
      mesh.userData.labelRadius = 0.05;
      meshes.set(`note-${index}`, mesh);
    }

    updateNodeLabelVisibility(meshes, new THREE.PerspectiveCamera(), null, null);

    expect(countNodeLabels(meshes)).toBe(MAX_ORDINARY_LABELS);
  });

  it("gives virtual hubs a distinct amber color", () => {
    expect(nodeColor({ domain: "virtual", is_virtual: true })).toBe(0xf59e0b);
    expect(nodeColor({ domain: "virtual", is_virtual: false })).not.toBe(0xf59e0b);
  });
});

function labeledMesh(isHub: boolean, z: number): NodeMesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshStandardMaterial()) as NodeMesh;
  const label = new THREE.Sprite();
  mesh.position.z = z;
  mesh.userData.isHub = isHub;
  mesh.userData.label = label;
  mesh.add(label);
  return mesh;
}
