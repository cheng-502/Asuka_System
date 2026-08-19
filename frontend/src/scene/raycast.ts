import * as THREE from "three";
import { displayPointToNdc } from "../hand/CoordinateMapper";
import type { NodeMesh } from "./nodes";

export function normalizedPointerToNdc(x: number, y: number): THREE.Vector2 {
  const ndc = displayPointToNdc({ x, y });
  return new THREE.Vector2(ndc.x, ndc.y);
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
