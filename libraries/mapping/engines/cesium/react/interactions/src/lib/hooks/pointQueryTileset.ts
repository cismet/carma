import { Cesium3DTileset, type Scene } from "@carma-cesium";

const pointQueryTilesetByScene = new WeakMap<Scene, Cesium3DTileset>();

const isUsablePointQueryTileset = (
  tileset: Cesium3DTileset | null | undefined
): tileset is Cesium3DTileset =>
  Boolean(tileset && typeof tileset.isDestroyed === "function") &&
  tileset.isDestroyed() === false;

export const registerCesiumScenePointQueryTileset = (
  scene: Scene,
  tileset: Cesium3DTileset
) => {
  pointQueryTilesetByScene.set(scene, tileset);

  return () => {
    if (pointQueryTilesetByScene.get(scene) !== tileset) {
      return;
    }

    pointQueryTilesetByScene.delete(scene);
  };
};

export const clearCesiumScenePointQueryTileset = (scene: Scene) => {
  pointQueryTilesetByScene.delete(scene);
};

export const getCesiumScenePointQueryTileset = (scene: Scene) => {
  const tileset = pointQueryTilesetByScene.get(scene);
  if (!isUsablePointQueryTileset(tileset)) {
    pointQueryTilesetByScene.delete(scene);
    return null;
  }

  return tileset;
};
