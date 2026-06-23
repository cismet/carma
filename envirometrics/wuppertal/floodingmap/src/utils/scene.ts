import { Color } from "@carma-cesium";
import type { CesiumRuntime } from "@carma-mapping/engines/cesium/react/runtime";

import { WATER_CESIUM_COLOR } from "../config/cesium/cesium.config";
export const prepareSceneForHGK = (runtime: CesiumRuntime) => {
  //console.debug("3d setup for HGK terrain style");
  if (runtime.isDestroyed()) return;

  runtime.scene.backgroundColor = Color.DIMGREY;
  runtime.scene.globe.baseColor = WATER_CESIUM_COLOR;
  runtime.scene.globe.show = true;
  runtime.scene.globe.translucency.enabled = true;
  runtime.scene.globe.translucency.frontFaceAlpha = 1.0;
  runtime.scene.globe.translucency.backFaceAlpha = 1.0;
  if (runtime.imageryLayers.length > 0) {
    //console.debug("hide default imagery layer hgk");
    const imageryLayer = runtime.imageryLayers.get(0);
    imageryLayer.show = false;
  }
  runtime.scene.requestRender();
};
