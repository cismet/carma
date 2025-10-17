// Re-export Cesium3DTileset class from Cesium
import { Cesium3DTileset } from "cesium";
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
