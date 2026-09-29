/** Millimetre snapping shared by mixed-level and equal-level terrain seams. */
export const TERRAIN_BOUNDARY_KEY_PRECISION = 1_000;

export const terrainBoundaryVertexKey = (x: number, z: number) =>
  `${Math.round(x * TERRAIN_BOUNDARY_KEY_PRECISION)}/${Math.round(
    z * TERRAIN_BOUNDARY_KEY_PRECISION
  )}`;
