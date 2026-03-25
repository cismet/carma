import { Cesium3DTileset } from "../cesium";
import type { Matrix4ConstructorArgs } from "./Matrix4";
import type { ColorConstructorArgs } from "./Color";
import type { Cartesian3ConstructorArgs } from "./Cartesian3";

/**
 * JSON-serializable constructor options for Cesium3DTileset.
 * Overrides Cesium object types with serializable types for config files.
 */
export type Cesium3DTilesetConstructorOptions = Omit<
  Cesium3DTileset.ConstructorOptions,
  "modelMatrix" | "lightColor" | "outlineColor"
> & {
  modelMatrix?: Matrix4ConstructorArgs;
  lightColor?: Cartesian3ConstructorArgs;
  outlineColor?: ColorConstructorArgs;
};
