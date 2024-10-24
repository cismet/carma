import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";

import { useCesiumViewer } from "./useCesiumViewer";
import {
  selectViewerCurrentTransition,
  selectViewerIsAnimating,
  selectViewerIsMode2d,
} from "../slices/cesium";

export const useLogCesiumRenderIn2D = () => {
  const viewer = useCesiumViewer();
  const isMode2d = useSelector(selectViewerIsMode2d);
  const isAnimatingRef = useRef(useSelector(selectViewerIsAnimating));
  const transitionRef = useRef(useSelector(selectViewerCurrentTransition));

  useEffect(() => {
    if (!viewer) return;
    const logRender = () => {
      if (isMode2d) {
        console.debug(
          "[CESIUM|2D3D] Cesium got rendered while in 2D mode",
          isAnimatingRef.current,
          transitionRef.current,
          isMode2d
        );
      }
    };

    // Subscribe to the postRender event
    console.debug("HOOK [CESIUM|SCENE] add postrender listener");
    viewer.scene.postRender.addEventListener(logRender);

    // Cleanup the event listener on unmount
    return () => {
      viewer.scene.postRender.removeEventListener(logRender);
      console.debug("HOOK [CESIUM|SCENE] add postrender removed");
    };
  }, [viewer, isMode2d]);
};
