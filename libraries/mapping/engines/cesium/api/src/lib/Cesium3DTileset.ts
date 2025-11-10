import { Cesium3DTileset } from "cesium";
import type { Matrix4ConstructorArgs } from "./Matrix4";
import type { ColorConstructorArgs } from "./Color";
import type { Cartesian3ConstructorArgs } from "./Cartesian3";

export { Cesium3DTileset };

export const isValidTileset = (
  tileset: unknown
): tileset is Cesium3DTileset => {
  return tileset instanceof Cesium3DTileset && tileset.isDestroyed() === false;
};

/**
 * Guard helper for Cesium3DTileset
 */
export const guardTileset = (tileset: Cesium3DTileset, label?: string) => {
  if (!isValidTileset(tileset)) {
    throw new Error(`Invalid Cesium3DTileset${label ? ` (${label})` : ""}`);
  }
};

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
