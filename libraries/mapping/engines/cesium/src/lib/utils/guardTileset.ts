import type { Cesium3DTileset } from "cesium";
import { isValidTileset } from "./instanceGates";

export const guardTileset = (tileset: Cesium3DTileset, label?: string) => {
  const ensure = <T>(fn: (t: Cesium3DTileset) => T, fallback: T): T => {
    try {
      if (!isValidTileset(tileset)) {
        console.warn("Tileset gate invalid", label);
        return fallback;
      }
      return fn(tileset);
    } catch (e) {
      console.warn("Tileset gate call failed", label, e);
      return fallback;
    }
  };

  return {
    show(flag: boolean) {
      ensure((t) => {
        t.show = flag;
      }, undefined);
      return this;
    },
  };
};
