import { useEffect } from "react";
import { useSelector } from "react-redux";

import { selectViewerIsAnimating } from "../slices/cesium";
import { guardScreenSpaceCameraController } from "../utils/guardScreenSpaceCameraController";
import { useCesiumContext } from "./useCesiumContext";
import { isTransitionState } from "../hooks/useMapTransition";

const useDisableSSCC = () => {
  const isAnimating = useSelector(selectViewerIsAnimating);
  console.debug("HOOKINIT [CESIUM|SCENE] useDisableSSCC");
  const ctx = useCesiumContext();
  const { transitionStateRef } = ctx;
  useEffect(() => {
    ctx.withViewer((viewer) => {
      const isEnabled =
        !isAnimating && !isTransitionState(transitionStateRef.current);
      console.info(
        "HOOK [CESIUM|SCENE|SSCC] map interaction set to",
        isEnabled
      );
      guardScreenSpaceCameraController(
        viewer.scene.screenSpaceCameraController,
        "useDisableSSCC"
      )
        .enableRotate(isEnabled)
        .enableZoom(isEnabled)
        .enableTilt(isEnabled);
    });
  }, [ctx, isAnimating, transitionStateRef]);
};

export default useDisableSSCC;
