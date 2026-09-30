// Shared modes for the reference-surface story and its render adapters.

export const TERRAIN_GEOMETRY_MODE = {
  MERCATOR: "mercator",
  WGS84_ECEF: "wgs84-ecef",
  LOCAL_SPHERE: "local-sphere",
} as const;

export type TerrainGeometryMode =
  (typeof TERRAIN_GEOMETRY_MODE)[keyof typeof TERRAIN_GEOMETRY_MODE];

export const TERRAIN_HEIGHT_DATUM = {
  DHHN2016: "dhhn2016",
  ELLIPSOIDAL: "ellipsoidal",
} as const;

export type TerrainHeightDatum =
  (typeof TERRAIN_HEIGHT_DATUM)[keyof typeof TERRAIN_HEIGHT_DATUM];

export const REFERENCE_SURFACE = {
  TANGENT: "tangent",
  SPHERE: "sphere",
  ELLIPSOID: "ellipsoid",
  QUASIGEOID: "quasigeoid",
  TERRAIN: "terrain",
} as const;

export type ReferenceSurface =
  (typeof REFERENCE_SURFACE)[keyof typeof REFERENCE_SURFACE];

export const terrainGeometryModeNumber = (mode: TerrainGeometryMode) =>
  mode === TERRAIN_GEOMETRY_MODE.MERCATOR
    ? 0
    : mode === TERRAIN_GEOMETRY_MODE.WGS84_ECEF
    ? 1
    : 2;

export const terrainHeightDatumNumber = (datum: TerrainHeightDatum) =>
  datum === TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL ? 1 : 0;
