import { useEffect } from "react";
import type { GlobeOptions } from "../CesiumSceneComponent";
import { useCesiumContext } from "../context";
import { isValidScene } from "@carma-mapping/engines/cesium/api";

export const useCesiumGlobe = (globeOptions: GlobeOptions) => {
  const { sceneRef } = useCesiumContext();

  useEffect(() => {
    const scene = sceneRef.current;
    if (isValidScene(scene) && scene && !scene.globe.isDestroyed()) {
      const { globe } = scene;
      console.debug("HOOK: [CESIUM] globe setting changed");
      try {
        // Enable the globe
        globe.show = true;

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
    sceneRef,
    globeOptions.baseColor,
    globeOptions.cartographicLimitRectangle,
    globeOptions.showGroundAtmosphere,
    globeOptions.showSkirts,
  ]);
};

export default useCesiumGlobe;
