import { useCallback, useEffect, useRef } from "react";

import { useMapHashRouting } from "@carma-appframeworks/portals";

export const useCesiumSceneChangeHandler = (isMode2d: boolean) => {
  const { handleCesiumSceneChange } = useMapHashRouting({
    isMode2d,
    labels: {
      clear3d: "GPM:2D:clear3d",
      write2d: "GPM:2D:writeLocation",
      topicMapLocation: "GPM:TopicMap:locationChangedHandler",
      cesiumScene: "GPM:3D",
    },
  });

  const isMode2dRef = useRef(isMode2d);
  useEffect(() => {
    isMode2dRef.current = isMode2d;
  }, [isMode2d]);

  const handlerRef = useRef(handleCesiumSceneChange);
  useEffect(() => {
    handlerRef.current = handleCesiumSceneChange;
  }, [handleCesiumSceneChange]);

  return useCallback((e: { hashParams: Record<string, string> }) => {
    if (isMode2dRef.current) {
      console.debug(
        "[CESIUM|DEBUG|CESIUM_WARN] Cesium scene change triggered while in 2D mode"
      );
      return;
    }
    handlerRef.current(e);
  }, []);
};
