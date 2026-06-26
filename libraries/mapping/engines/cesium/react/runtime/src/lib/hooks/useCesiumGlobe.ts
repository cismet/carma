import { useEffect } from "react";

import type { GlobeOptions } from "../CesiumHost";
import { useCesiumContext } from "./useCesiumContext";
export const useCesiumGlobe = (globeOptions: GlobeOptions) => {
  const ctx = useCesiumContext();

  useEffect(() => {
    ctx.withScene((scene) => {
      if (!scene.globe) {
        return;
      }

      console.debug("HOOK: [CESIUM] globe setting changed");
      // set the globe props
      if (globeOptions.baseColor !== undefined) {
        console.debug(
          "HOOK: [CESIUM] set globe baseColor",
          globeOptions.baseColor
        );
        scene.globe.baseColor = globeOptions.baseColor;
      }
      if (globeOptions.cartographicLimitRectangle !== undefined) {
        console.debug(
          "HOOK: [CESIUM] set globe cartographicLimitRectangle",
          globeOptions.cartographicLimitRectangle
        );
        scene.globe.cartographicLimitRectangle =
          globeOptions.cartographicLimitRectangle;
      }
      if (globeOptions.showGroundAtmosphere !== undefined) {
        console.debug(
          "HOOK: [CESIUM] set globe showGroundAtmosphere",
          globeOptions.showGroundAtmosphere
        );
        scene.globe.showGroundAtmosphere = globeOptions.showGroundAtmosphere;
      }
      if (globeOptions.showSkirts !== undefined) {
        console.debug(
          "HOOK: [CESIUM] set globe showSkirts",
          globeOptions.showSkirts
        );
        scene.globe.showSkirts = globeOptions.showSkirts;
      }
    });
  }, [
    ctx,
    globeOptions.baseColor,
    globeOptions.cartographicLimitRectangle,
    globeOptions.showGroundAtmosphere,
    globeOptions.showSkirts,
  ]);
};

export default useCesiumGlobe;
