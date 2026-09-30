/** Millimetre snapping shared by mixed-level and equal-level terrain seams. */
export const TERRAIN_BOUNDARY_KEY_PRECISION = 1_000;

export const terrainBoundaryVertexKey = (x: number, z: number) =>
  `${Math.round(x * TERRAIN_BOUNDARY_KEY_PRECISION)}/${Math.round(
    z * TERRAIN_BOUNDARY_KEY_PRECISION
  )}`;

/** The four sides of a terrain tile, named by the compass direction they face. */
export const TERRAIN_BOUNDARY_SIDE = {
  WEST: "west",
  SOUTH: "south",
  EAST: "east",
  NORTH: "north",
} as const;

export type TerrainBoundarySide =
  (typeof TERRAIN_BOUNDARY_SIDE)[keyof typeof TERRAIN_BOUNDARY_SIDE];
