import { type Cesium3DTileset } from "cesium";
import { type PlainCartesian3 } from "@carma-commons/types";
import { type CesiumCustomChaderOptions } from "@carma-commons/types";

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
  shader?: CesiumCustomChaderOptions;
  translation?: PlainCartesian3;
  idProperty?: string;
  disableSelection?: boolean;
  constructorOptions?: Cesium3DTileset.ConstructorOptions;
};
