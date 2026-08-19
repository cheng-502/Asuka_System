import type { NormalizedLandmark } from "./HandFrame";

export interface Point2D {
  x: number;
  y: number;
}

export interface MappedCameraPoint {
  display: Point2D;
  viewport: Point2D;
  ndc: Point2D;
}

export function mirrorCameraPoint(point: Point2D): Point2D {
  const normalized = normalizedPoint(point);
  return { x: 1 - normalized.x, y: normalized.y };
}

export function displayPointToNdc(point: Point2D): Point2D {
  const normalized = normalizedPoint(point);
  return { x: normalized.x * 2 - 1, y: 1 - normalized.y * 2 };
}

export function mapRawCameraPoint(
  point: Point2D,
  viewportWidth: number,
  viewportHeight: number,
): MappedCameraPoint {
  const display = mirrorCameraPoint(point);
  return {
    display,
    viewport: {
      x: display.x * viewportWidth,
      y: display.y * viewportHeight,
    },
    ndc: displayPointToNdc(display),
  };
}

export function mirrorHandLandmarks(
  landmarks: readonly NormalizedLandmark[],
): NormalizedLandmark[] {
  return landmarks.map((landmark) => {
    const display = mirrorCameraPoint(landmark);
    return { ...landmark, ...display };
  });
}

function normalizedPoint(point: Point2D): Point2D {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError("Normalized point coordinates must be finite");
  }
  return { x: clamp01(point.x), y: clamp01(point.y) };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
