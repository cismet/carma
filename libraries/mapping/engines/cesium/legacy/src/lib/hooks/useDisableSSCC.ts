import { useEffect } from "react";
import { useSelector } from "react-redux";

import {
  selectViewerIsAnimating,
  selectViewerIsTransitioning,
} from "../slices/cesium";
import { guardScreenSpaceCameraController } from "../utils/guardScreenSpaceCameraController";
import { useCesiumContext } from "./useCesiumContext";

const useDisableSSCC = () => {
  const isAnimating = useSelector(selectViewerIsAnimating);
  const isTransitioning = useSelector(selectViewerIsTransitioning);
  const ctx = useCesiumContext();
  useEffect(() => {
    ctx.withViewer((viewer) => {
      const isEnabled = !isAnimating && !isTransitioning;
      console.debug("[CESIUM|SCENE|SSCC] map interaction set to", isEnabled);
      guardScreenSpaceCameraController(
        viewer.scene.screenSpaceCameraController,
        "useDisableSSCC"
      )
        .enableRotate(isEnabled)
        .enableZoom(isEnabled)
        .enableTilt(isEnabled);
    });
  }, [ctx, isAnimating, isTransitioning]);
};

export default useDisableSSCC;
