import type { Cesium3DTileset } from "@carma-cesium";
import type { MetricVector3 } from "@carma-units";

import type { CesiumCustomShaderOptions } from "./cesium-shaders.d";

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

export type TilesetConfig = {
  url: string;
  key: string;
  type: TilesetType;
  contentTypes?: ContentType[];
  shader?: CesiumCustomShaderOptions;
  translation?: MetricVector3;
  idProperty?: string;
  disableSelection?: boolean;
  constructorOptions?: Cesium3DTileset.ConstructorOptions;
};

export type EndpointOptions = {
  crs: string;
  host: string;
};
