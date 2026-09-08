import type { Box3, Matrix4 } from "three";

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
