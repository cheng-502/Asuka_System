import * as THREE from "three";
import type { NodeMesh } from "./nodes";

export function normalizedPointerToNdc(x: number, y: number): THREE.Vector2 {
  return new THREE.Vector2(x * 2 - 1, 1 - y * 2);
}

export function pickNode(
  camera: THREE.Camera,
  pointer: THREE.Vector2,
  nodeMeshes: Map<string, NodeMesh>,
  raycaster = new THREE.Raycaster(),
): string | null {
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObjects([...nodeMeshes.values()], false);
  const nodeId = intersections[0]?.object.userData.nodeId;
  return typeof nodeId === "string" ? nodeId : null;
}
