import { type Cesium3DTileset, type Cartesian3Json } from "@carma/cesium";

import type { CesiumCustomShaderOptions } from "@carma/types";

export enum TilesetType {
  MESH = "mesh",
  LOD0 = "lod0",
  LOD1 = "lod1",
  LOD2 = "lod2",
  LOD3 = "lod3",
  LOD4 = "lod4",
}

export enum ContentType {
  SURFACE = "surface",
  BUILDINGS = "buildings",
  BRIDGES = "bridges",
  TREES = "trees",
}

export type TilesetConfig = {
  url: string;
  key: string;
  type: TilesetType;
  contentTypes?: ContentType[];
  shader?: CesiumCustomShaderOptions;
  translation?: Cartesian3Json;
  idProperty?: string;
  disableSelection?: boolean;
  constructorOptions?: Cesium3DTileset.ConstructorOptions;
};
