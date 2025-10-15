import { CesiumCustomShaderOptions } from "./cesium-shaders";
import { PlainCartesian3 } from "../geo/geo";
import { Cesium3DTileset } from "cesium";

export const TilesetTypes = {
  MESH: "mesh",
  LOD0: "lod0",
  LOD1: "lod1",
  LOD2: "lod2",
  LOD3: "lod3",
  LOD4: "lod4",
} as const;

export type TilesetType = (typeof TilesetTypes)[keyof typeof TilesetTypes];

export const ContentTypes = {
  SURFACE: "surface",
  BUILDINGS: "buildings",
  BRIDGES: "bridges",
  TREES: "trees",
} as const;

export type ContentType = (typeof ContentTypes)[keyof typeof ContentTypes];

export const ModelTypes = {
  DEM: "dem",
  DSM: "dsm",
} as const;

export type ModelType = (typeof ModelTypes)[keyof typeof ModelTypes];

export type TilesetConfig = {
  url: string;
  key: string;
  type: TilesetType;
  modelType?: ModelType;
  contentTypes?: ContentType[];
  shader?: CesiumCustomShaderOptions;
  translation?: PlainCartesian3;
  idProperty?: string;
  disableSelection?: boolean;
  constructorOptions?: Cesium3DTileset.ConstructorOptions;
};
