import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Cesium3DTileset,
  Matrix4,
  Viewer,
} from 'cesium';
import { TilesetConfig } from '../..';

export const toDegFactor = 180 / Math.PI;

export function getModelMatrix(config: TilesetConfig, heightOffset = 0) {
  const { x, y, z } = config.translation;
  const surface = Cartesian3.fromRadians(x, y, z);
  const offset = Cartesian3.fromRadians(x, y, z + heightOffset);
  const translation = Cartesian3.subtract(offset, surface, new Cartesian3());
  const modelMatrix = Matrix4.fromTranslation(translation);
  return modelMatrix;
}

export function getCanvasCenter(viewer: Viewer) {
  const windowPosition = new Cartesian2(
    viewer.canvas.clientWidth / 2,
    viewer.canvas.clientHeight / 2
  );

  return viewer.scene.pickPosition(windowPosition);
}

// use with onReady event of Cesium3DTileset
export const logTileSetInfoOnReady = (tileset: Cesium3DTileset) => {
  const { center } = tileset.root.boundingSphere;
  const cartographic = Cartographic.fromCartesian(center);
  const longitude = cartographic.longitude * toDegFactor;
  const latitude = cartographic.latitude * toDegFactor;
  const height = cartographic.height;

  console.log(
    `Longitude: ${longitude}, Latitude: ${latitude}, Height: ${height}, center: ${center}, ${tileset.basePath}}`
  );
};
