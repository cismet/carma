/**
 * How the map's own content meets a terrain-providing tileset: `labels`
 * drapes the point labels over it, `none` leaves the tileset untouched.
 */
export const TILES3D_BASEMAP = {
  LABELS: "labels",
  NONE: "none",
} as const;

export type Tiles3dBasemap =
  (typeof TILES3D_BASEMAP)[keyof typeof TILES3D_BASEMAP];
