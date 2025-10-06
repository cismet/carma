import { useCallback, useEffect, useRef } from "react";
import { useSelector } from "react-redux";

import { useMapHashRouting } from "@carma-appframeworks/portals";
import { selectViewerIsMode2d } from "@carma-mapping/engines/cesium";

export const useCesiumSceneChangeHandler = () => {
  const isMode2d = useSelector(selectViewerIsMode2d);

  const { handleCesiumSceneChange } = useMapHashRouting({
    isMode2d,
    labels: {
      clear3d: "GPM:2D:clear3d",
      write2d: "GPM:2D:writeLocation",
      topicMapLocation: "GPM:TopicMap:locationChangedHandler",
      cesiumScene: "GPM:3D",
    },
  });

  const handlerRef = useRef(handleCesiumSceneChange);
  useEffect(() => {
    if (isMode2d) {
      handlerRef.current = () => {
        console.debug(
          "[CESIUM|DEBUG|CESIUM_WARN] Cesium scene change triggered while in 2D mode"
        );
      };
      return;
    }
    handlerRef.current = handleCesiumSceneChange;
  }, [handleCesiumSceneChange, isMode2d]);

  return useCallback((e: { hashParams: Record<string, string> }) => {
    handlerRef.current(e);
  }, []);
};
