import { useEffect } from "react";
import { useSelector } from "react-redux";

import { useCesiumContext } from "../CesiumContextProvider";
import {
  selectViewerIsAnimating,
  selectViewerIsTransitioning,
} from "../slices/cesium";

const useDisableSSCC = () => {
  const { viewer } = useCesiumContext();
  const isAnimating = useSelector(selectViewerIsAnimating);
  const isTransitioning = useSelector(selectViewerIsTransitioning);
  useEffect(() => {
    if (!viewer) return;
    const isEnabled = !isAnimating && !isTransitioning;
    if (!isEnabled) {
      console.info(
        "HOOK [CESIUM|SCENE|SSCC] map interaction disabled during animations and transitions",
        isEnabled,
      );
    }
    viewer.scene.screenSpaceCameraController.enableRotate = isEnabled;
    viewer.scene.screenSpaceCameraController.enableZoom = isEnabled;
    viewer.scene.screenSpaceCameraController.enableTilt = isEnabled;
  }, [viewer, isAnimating, isTransitioning]);
};

export default useDisableSSCC;
