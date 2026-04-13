import type { TilesetConfig } from "@carma-mapping/engines/cesium/core";

export type { TilesetConfig };

export const TilesetType = {
  MESH: "mesh",
  LOD0: "lod0",
  LOD1: "lod1",
  LOD2: "lod2",
  LOD3: "lod3",
  LOD4: "lod4",
} as const;
export type TilesetType = (typeof TilesetType)[keyof typeof TilesetType];

export const ContentType = {
  SURFACE: "surface",
  BUILDINGS: "buildings",
  BRIDGES: "bridges",
  TREES: "trees",
} as const;
export type ContentType = (typeof ContentType)[keyof typeof ContentType];
