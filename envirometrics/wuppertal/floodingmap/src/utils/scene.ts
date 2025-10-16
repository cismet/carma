import { Color, Viewer } from "cesium";
import { WATER_CESIUM_COLOR } from "../config/cesium/cesium.config";

export const prepareSceneForHGK = (viewer: Viewer) => {
  //console.debug("3d setup for HGK terrain style");
  if (viewer.isDestroyed()) return;

  viewer.scene.backgroundColor = Color.DIMGREY;
  viewer.scene.globe.baseColor = WATER_CESIUM_COLOR;
  viewer.scene.globe.show = true;
  viewer.scene.globe.translucency.enabled = true;
  viewer.scene.globe.translucency.frontFaceAlpha = 1.0;
  viewer.scene.globe.translucency.backFaceAlpha = 1.0;
  if (viewer.imageryLayers.length > 0) {
    //console.debug("hide default imagery layer hgk");
    const imageryLayer = viewer.imageryLayers.get(0);
    imageryLayer.show = false;
  }
  viewer.scene.requestRender();
};
