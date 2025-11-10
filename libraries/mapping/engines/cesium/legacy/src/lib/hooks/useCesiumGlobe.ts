import { useEffect } from "react";
import { useCesiumViewer } from "./useCesiumViewer";
import type { GlobeOptions } from "../CustomViewer";

export const useCesiumGlobe = (globeOptions: GlobeOptions) => {
  const viewer = useCesiumViewer();

  useEffect(() => {
    if (viewer && viewer.scene.globe) {
      console.debug("HOOK: [CESIUM] globe setting changed");
      // set the globe props
      if (globeOptions.baseColor !== undefined) {
        console.debug(
          "HOOK: [CESIUM] set globe baseColor",
          globeOptions.baseColor
        );
        viewer.scene.globe.baseColor = globeOptions.baseColor;
      }
      if (globeOptions.cartographicLimitRectangle !== undefined) {
        console.debug(
          "HOOK: [CESIUM] set globe cartographicLimitRectangle",
          globeOptions.cartographicLimitRectangle
        );
        viewer.scene.globe.cartographicLimitRectangle =
          globeOptions.cartographicLimitRectangle;
      }
      if (globeOptions.showGroundAtmosphere !== undefined) {
        console.debug(
          "HOOK: [CESIUM] set globe showGroundAtmosphere",
          globeOptions.showGroundAtmosphere
        );
        viewer.scene.globe.showGroundAtmosphere =
          globeOptions.showGroundAtmosphere;
      }
      if (globeOptions.showSkirts !== undefined) {
        console.debug(
          "HOOK: [CESIUM] set globe showSkirts",
          globeOptions.showSkirts
        );
        viewer.scene.globe.showSkirts = globeOptions.showSkirts;
      }
    }
  }, [
    viewer,
    globeOptions.baseColor,
    globeOptions.cartographicLimitRectangle,
    globeOptions.showGroundAtmosphere,
    globeOptions.showSkirts,
  ]);
};

export default useCesiumGlobe;
