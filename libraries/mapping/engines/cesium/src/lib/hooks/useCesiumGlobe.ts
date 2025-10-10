import { useEffect } from "react";
import type { GlobeOptions } from "../CustomViewer";
import { useCesiumContext } from "./useCesiumContext";
import { isValidScene } from "../utils/instanceGates";

export const useCesiumGlobe = (globeOptions: GlobeOptions) => {
  const { isViewerReady, sceneRef } = useCesiumContext();

  useEffect(() => {
    const scene = sceneRef.current;
    if (isViewerReady && isValidScene(scene) && !scene.globe.isDestroyed()) {
      const { globe } = scene;
      console.debug("HOOK: [CESIUM] globe setting changed");
      try {
        // set the globe props
        if (globeOptions.baseColor !== undefined) {
          console.debug(
            "HOOK: [CESIUM] set globe baseColor",
            globeOptions.baseColor
          );
          globe.baseColor = globeOptions.baseColor;
        }
        if (globeOptions.cartographicLimitRectangle !== undefined) {
          console.debug(
            "HOOK: [CESIUM] set globe cartographicLimitRectangle",
            globeOptions.cartographicLimitRectangle
          );
          globe.cartographicLimitRectangle =
            globeOptions.cartographicLimitRectangle;
        }
        if (globeOptions.showGroundAtmosphere !== undefined) {
          console.debug(
            "HOOK: [CESIUM] set globe showGroundAtmosphere",
            globeOptions.showGroundAtmosphere
          );
          globe.showGroundAtmosphere = globeOptions.showGroundAtmosphere;
        }
        if (globeOptions.showSkirts !== undefined) {
          console.debug(
            "HOOK: [CESIUM] set globe showSkirts",
            globeOptions.showSkirts
          );
          globe.showSkirts = globeOptions.showSkirts;
        }
      } catch (error) {
        console.error("HOOK: [CESIUM] globe setting changed failed", error);
      }
    }
  }, [
    isViewerReady,
    sceneRef,
    globeOptions.baseColor,
    globeOptions.cartographicLimitRectangle,
    globeOptions.showGroundAtmosphere,
    globeOptions.showSkirts,
  ]);
};

export default useCesiumGlobe;
