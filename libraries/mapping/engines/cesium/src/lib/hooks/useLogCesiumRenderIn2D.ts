import { useEffect } from "react";
import { useSelector } from "react-redux";

import { selectViewerIsMode2d } from "../slices/cesium";
import { useCesiumContext } from "./useCesiumContext";

export const useLogCesiumRenderIn2D = () => {
  const { viewerRef } = useCesiumContext();
  const isMode2d = useSelector(selectViewerIsMode2d);

  useEffect(() => {
    if (!viewerRef || !viewerRef.current || !viewerRef.current.scene) return;
    const viewer = viewerRef.current;
    const scene = viewer.scene;
    const logRender = () => {
      if (isMode2d) {
        console.debug(
          "[CESIUM|2D3D] Cesium got rendered while in 2D mode",
          isMode2d
        );
      }
    };

    // Subscribe to the postRender event
    console.debug("HOOK [CESIUM|SCENE] add postrender listener");
    scene && scene.postRender.addEventListener(logRender);

    // Cleanup the event listener on unmount
    return () => {
      scene && scene.postRender.removeEventListener(logRender);
      console.debug("HOOK [CESIUM|SCENE] add postrender removed");
    };
  }, [viewerRef, isMode2d]);
};
