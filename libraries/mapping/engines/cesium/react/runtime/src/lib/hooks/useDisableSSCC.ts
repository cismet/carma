import { useEffect } from "react";

import { useCesiumContext } from "./useCesiumContext";

const useDisableSSCC = () => {
  const ctx = useCesiumContext();
  const { isAnimating, isTransitioning } = ctx;
  useEffect(() => {
    ctx.withScene((scene) => {
      const isEnabled = !isAnimating && !isTransitioning;
      console.debug("[CESIUM|SCENE|SSCC] map interaction set to", isEnabled);
      // withScene guarantees a live scene → its screenSpaceCameraController is valid.
      const sscc = scene.screenSpaceCameraController;
      sscc.enableRotate = isEnabled;
      sscc.enableZoom = isEnabled;
      sscc.enableTilt = isEnabled;
    });
  }, [ctx, isAnimating, isTransitioning]);
};

export default useDisableSSCC;
