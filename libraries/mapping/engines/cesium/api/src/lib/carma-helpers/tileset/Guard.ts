import { Cesium3DTileset } from "../../cesium";
import { isValidTileset } from "../../carma-guards";

/**
 * Guard helper for Cesium3DTileset.
 */
export const guardTileset = (tileset: Cesium3DTileset, label?: string) => {
  if (!isValidTileset(tileset)) {
    throw new Error(`Invalid Cesium3DTileset${label ? ` (${label})` : ""}`);
  }
};
