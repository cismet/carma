import type { Box3, Frustum, Matrix4 } from "three";

export interface TileBoundsVolume {
  getAABB: (target: Box3) => void;
  getOBB?: (bounds: Box3, transform: Matrix4) => void;
}

/** Preserve native OBB axes until the final world/light-space projection. */
export const readOrientedTileBounds = (
  volume: TileBoundsVolume,
  bounds: Box3,
  transform: Matrix4
): void => {
  transform.identity();
  if (volume.getOBB) volume.getOBB(bounds, transform);
  else volume.getAABB(bounds);
};

/**
 * A reserve margin measured in the candidate OBB's own widths, not viewport
 * widths. Keep the camera's near/far planes unchanged. The six-plane support
 * test matches native conservative frustum culling and never mutates inputs.
 */
export const intersectsTileFrustumMargin = (
  bounds: Box3,
  boundsToWorld: Matrix4,
  frustum: Frustum,
  widths: number
): boolean => {
  if (bounds.isEmpty() || !Number.isFinite(widths) || widths < 0) return false;
  const cx = (bounds.min.x + bounds.max.x) / 2;
  const cy = (bounds.min.y + bounds.max.y) / 2;
  const cz = (bounds.min.z + bounds.max.z) / 2;
  const hx = (bounds.max.x - bounds.min.x) / 2;
  const hy = (bounds.max.y - bounds.min.y) / 2;
  const hz = (bounds.max.z - bounds.min.z) / 2;
  const e = boundsToWorld.elements;
  const x = e[0] * cx + e[4] * cy + e[8] * cz + e[12];
  const y = e[1] * cx + e[5] * cy + e[9] * cz + e[13];
  const z = e[2] * cx + e[6] * cy + e[10] * cz + e[14];
  return frustum.planes.every((plane, index) => {
    const n = plane.normal;
    const radius =
      Math.abs(n.x * e[0] + n.y * e[1] + n.z * e[2]) * hx +
      Math.abs(n.x * e[4] + n.y * e[5] + n.z * e[6]) * hy +
      Math.abs(n.x * e[8] + n.y * e[9] + n.z * e[10]) * hz;
    // Three orders the four side planes before far/near.
    const extent = radius * (index < 4 ? 1 + 2 * widths : 1);
    const distance = n.x * x + n.y * y + n.z * z + plane.constant + extent;
    // Touching the outer reserve edge must not admit the next sibling row.
    return index < 4 && widths > 0 ? distance > 0 : distance >= 0;
  });
};
