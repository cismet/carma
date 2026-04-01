import type { Cesium3DTileset } from "@carma-cesium";
import type { MetricVector3 } from "@carma-units";

import type { CesiumCustomShaderOptions } from "./cesium-shaders";

export type TilesetTypeValue =
  | "mesh"
  | "lod0"
  | "lod1"
  | "lod2"
  | "lod3"
  | "lod4";

export type ContentTypeValue = "surface" | "buildings" | "bridges" | "trees";

export type TilesetConfig = {
  url: string;
  key: string;
  type: TilesetTypeValue;
  contentTypes?: ContentTypeValue[];
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
