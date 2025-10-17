export const ContentTypes = {
  SURFACE: "surface",
  BUILDINGS: "buildings",
  BRIDGES: "bridges",
  TREES: "trees",
} as const;

export type ContentType = (typeof ContentTypes)[keyof typeof ContentTypes];

export const SurfaceModelTypes = {
  DEM: "dem",
  DSM: "dsm",
  WATER: "water", // custom type for floodingmap etc
} as const;

export type SurfaceModelType =
  (typeof SurfaceModelTypes)[keyof typeof SurfaceModelTypes];

/**
 * CityGML Level of Detail classification
 * Note: MESH here refers to LOD-equivalent photogrammetry detail
 */
export const CityModelTypes = {
  MESH: "mesh", // Photogrammetry mesh (LOD equivalent)
  LOD0: "lod0", // Block model (footprint extrusion)
  LOD1: "lod1", // Block model with roof shape
  LOD2: "lod2", // Detailed exterior with roof structures
  LOD3: "lod3", // Architectural model (detailed facade)
  LOD4: "lod4", // Interior model
} as const;

export type CityModelType =
  (typeof CityModelTypes)[keyof typeof CityModelTypes];
