import { useEffect } from "react";
import { useSelector } from "react-redux";

import {
  selectCesiumIsAnimating,
  selectSceneIsTransitioning,
} from "../slices/cesium";
import { guardScreenSpaceCameraController } from "../utils/guardScreenSpaceCameraController";
import { useCesiumContext } from "./useCesiumContext";

const useDisableSSCC = () => {
  const isAnimating = useSelector(selectCesiumIsAnimating);
  const isTransitioning = useSelector(selectSceneIsTransitioning);
  console.debug("HOOKINIT [CESIUM|SCENE] useDisableSSCC");
  const ctx = useCesiumContext();
  useEffect(() => {
    ctx.withWidget((w) => {
      const isEnabled = !isAnimating && !isTransitioning;
      console.info(
        "HOOK [CESIUM|SCENE|SSCC] map interaction set to",
        isEnabled
      );
      guardScreenSpaceCameraController(
        w.scene.screenSpaceCameraController,
        "useDisableSSCC"
      )
        .enableRotate(isEnabled)
        .enableZoom(isEnabled)
        .enableTilt(isEnabled);
    });
  }, [ctx, isAnimating, isTransitioning]);
};

export default useDisableSSCC;
