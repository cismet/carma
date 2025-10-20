import { useEffect } from "react";
import type { GlobeOptions } from "../../CesiumSceneComponent";
import { useCesiumContext } from "../../context";
import { isValidScene } from "@carma/cesium";
import { Color } from "@carma/cesium";

export const useCesiumGlobe = (globeOptions: GlobeOptions) => {
  const { sceneRef } = useCesiumContext();

  useEffect(() => {
    const scene = sceneRef.current;
    if (!isValidScene(scene)) return;

    const { globe } = scene;
    console.debug("HOOK: [CESIUM] globe setting changed");

    // Always ensure globe is visible
    globe.show = true;

    if (globeOptions.baseColor) {
      // baseColor can be a Color object or an array [r, g, b, a] in 0-1 range
      if (Array.isArray(globeOptions.baseColor)) {
        const [r, g, b, a] = globeOptions.baseColor;
        const color = new Color(r, g, b, a);
        globe.baseColor = color;
        console.debug(
          `HOOK: [CESIUM] set globe baseColor (array)`,
          globeOptions.baseColor
        );
      } else {
        // Already a Color object
        globe.baseColor = globeOptions.baseColor;
        console.debug(`HOOK: [CESIUM] set globe baseColor (Color object)`);
      }
    }

    if (globeOptions.cartographicLimitRectangle !== undefined) {
      globe.cartographicLimitRectangle =
        globeOptions.cartographicLimitRectangle;
    }

    if (globeOptions.showGroundAtmosphere !== undefined) {
      globe.showGroundAtmosphere = globeOptions.showGroundAtmosphere;
    }

    if (globeOptions.showSkirts !== undefined) {
      globe.showSkirts = globeOptions.showSkirts;
    }

    scene.requestRender();
  }, [
    sceneRef,
    globeOptions.baseColor,
    globeOptions.cartographicLimitRectangle,
    globeOptions.showGroundAtmosphere,
    globeOptions.showSkirts,
  ]);
};

export default useCesiumGlobe;
