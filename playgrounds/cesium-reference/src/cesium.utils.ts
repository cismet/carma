import { Cesium3DTileset } from "cesium";

export const getTileset = async (url: string) => {
  try {
    const tileset = await Cesium3DTileset.fromUrl(url);
    return tileset;
  } catch (e) {
    console.error("Error loading tileset:", e);
    throw e;
  }
};
