import { Color, Scene } from "cesium";
import { WATER_CESIUM_COLOR } from "../config/cesium/cesium.config";

export const prepareSceneForHGK = (scene: Scene) => {
  //console.debug("3d setup for HGK terrain style");
  if (scene.isDestroyed()) return;

  scene.backgroundColor = Color.DIMGREY;
  scene.globe.baseColor = WATER_CESIUM_COLOR;
  scene.globe.show = true;
  scene.globe.translucency.enabled = true;
  scene.globe.translucency.frontFaceAlpha = 1.0;
  scene.globe.translucency.backFaceAlpha = 1.0;

  // Note: imageryLayers are on the viewer, not the scene
  // This needs to be handled separately where viewer is available
  // if (viewer.imageryLayers.length > 0) {
  //   const imageryLayer = viewer.imageryLayers.get(0);
  //   imageryLayer.show = false;
  // }

  scene.requestRender();
};
