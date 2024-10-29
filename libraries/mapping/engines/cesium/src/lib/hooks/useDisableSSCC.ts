import { useEffect } from "react";
import { useSelector } from "react-redux";

import { useCesiumViewer } from "./useCesiumViewer";
import {
  selectViewerIsAnimating,
  selectViewerIsTransitioning,
} from "../slices/cesium";

const useDisableSSCC = () => {
  const viewer = useCesiumViewer();
  const isAnimating = useSelector(selectViewerIsAnimating);
  const isTransitioning = useSelector(selectViewerIsTransitioning);
  console.debug("HOOKINIT [CESIUM|SCENE] useDisableSSCC");
  useEffect(() => {
    if (!viewer) return;
    const isEnabled = !isAnimating && !isTransitioning;
    console.info("HOOK [CESIUM|SCENE|SSCC] map interaction set to", isEnabled);
    viewer.scene.screenSpaceCameraController.enableRotate = isEnabled;
    viewer.scene.screenSpaceCameraController.enableZoom = isEnabled;
    viewer.scene.screenSpaceCameraController.enableTilt = isEnabled;
  }, [viewer, isAnimating, isTransitioning]);
};

export default useDisableSSCC;
