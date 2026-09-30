import { Vector2 } from "three";
import type { ObliquePose } from "../types";

export type FootprintMarkerGeometry = {
  triangle: [Vector2, Vector2, Vector2];
  /** Top left, top right, bottom right, bottom left, in image orientation. */
  labelCorners: [Vector2, Vector2, Vector2, Vector2];
};

/** Local planar coordinates are east/north metres, matching the pose's ENU frame. */
export const footprintMarkerGeometry = (
  polygon: readonly Vector2[],
  pose: Pick<ObliquePose, "direction" | "up">
): FootprintMarkerGeometry | null => {
  if (polygon.length < 3 || polygon.some((p) => !Number.isFinite(p.x + p.y)))
    return null;
  const [dx, dy, dz] = pose.direction;
  const [ux, uy, uz] = pose.up;
  // Differentiate the camera ray's ground-plane intersection, retaining roll.
  if (!Number.isFinite(dx + dy + dz + ux + uy + uz) || dz >= -1e-6) return null;
  const up = new Vector2(ux - (dx * uz) / dz, uy - (dy * uz) / dz);
  if (up.lengthSq() < 1e-12) return null;
  up.normalize();
  const right = new Vector2(up.y, -up.x);
  const center = new Vector2();
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const cross = a.cross(b);
    area += cross;
    center.addScaledVector(a.clone().add(b), cross);
  }
  if (Math.abs(area) < 1e-8) return null;
  center.divideScalar(3 * area);
  const down = up.clone().negate();
  let bottomDistance = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      edge = polygon[(i + 1) % polygon.length].clone().sub(a);
    const denominator = down.cross(edge);
    if (Math.abs(denominator) < 1e-10) continue;
    const delta = a.clone().sub(center);
    const distance = delta.cross(edge) / denominator;
    const fraction = delta.cross(down) / denominator;
    if (distance > 0 && fraction >= -1e-8 && fraction <= 1 + 1e-8)
      bottomDistance = Math.min(bottomDistance, distance);
  }
  if (!Number.isFinite(bottomDistance)) return null;
  const extent = polygon.map((p) => p.dot(right));
  const span = Math.max(...extent) - Math.min(...extent);
  const width = span * 0.5;
  const arrowSize = Math.min(span * 0.12, bottomDistance * 0.22);
  const bottom = center.clone().addScaledVector(down, bottomDistance);
  const corner = (x: number, y: number) =>
    center.clone().addScaledVector(right, x).addScaledVector(up, y);
  return {
    triangle: [
      bottom.clone().addScaledVector(up, arrowSize),
      bottom.clone().addScaledVector(right, arrowSize * Math.sqrt(3)),
      bottom.clone().addScaledVector(right, -arrowSize * Math.sqrt(3)),
    ],
    labelCorners: [
      corner(-width / 2, width / 4),
      corner(width / 2, width / 4),
      corner(width / 2, -width / 4),
      corner(-width / 2, -width / 4),
    ],
  };
};
