import { useEffect } from "react";
import { useSelector } from "react-redux";

import {
  selectCesiumRuntimeIsAnimating,
  selectCesiumRuntimeIsTransitioning,
} from "../slices/cesium";
import { guardScreenSpaceCameraController } from "../utils/guardScreenSpaceCameraController";
import { useCesiumContext } from "./useCesiumContext";
const useDisableSSCC = () => {
  const isAnimating = useSelector(selectCesiumRuntimeIsAnimating);
  const isTransitioning = useSelector(selectCesiumRuntimeIsTransitioning);
  const ctx = useCesiumContext();
  useEffect(() => {
    ctx.withScene((scene) => {
      const isEnabled = !isAnimating && !isTransitioning;
      console.debug("[CESIUM|SCENE|SSCC] map interaction set to", isEnabled);
      guardScreenSpaceCameraController(
        scene.screenSpaceCameraController,
        "useDisableSSCC"
      )
        .enableRotate(isEnabled)
        .enableZoom(isEnabled)
        .enableTilt(isEnabled);
    });
  }, [ctx, isAnimating, isTransitioning]);
};

export default useDisableSSCC;
