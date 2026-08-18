import * as THREE from "three";

export interface CameraFrame {
  center: THREE.Vector3;
  distance: number;
  minDistance: number;
  maxDistance: number;
  near: number;
  far: number;
}

const DEFAULT_DISTANCE = 8;

export function calculateCameraFrame(
  positions: readonly THREE.Vector3[],
  fovDegrees = 45,
): CameraFrame {
  if (!positions.length) {
    return {
      center: new THREE.Vector3(),
      distance: DEFAULT_DISTANCE,
      minDistance: 0.25,
      maxDistance: 64,
      near: 0.1,
      far: 1000,
    };
  }

  const bounds = new THREE.Box3().setFromPoints([...positions]);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 0.5);
  const fovRadians = THREE.MathUtils.degToRad(fovDegrees);
  const distance = Math.max((radius * 1.35) / Math.tan(fovRadians / 2), 4);

  return {
    center: sphere.center.clone(),
    distance,
    minDistance: Math.max(radius * 0.08, 0.25),
    maxDistance: Math.max(distance * 4, 32),
    near: Math.max(distance / 100, 0.1),
    far: Math.max(distance * 8, 100),
  };
}
