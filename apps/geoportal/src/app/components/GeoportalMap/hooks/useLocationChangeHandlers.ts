import { useMemo } from "react";
import * as L from "leaflet";

import {
  createLocationChangeHandler,
  useMapHashRouting,
} from "@carma-appframeworks/portals";
import { useLeafletZoomControls } from "@carma-mapping/utils";

interface Options {
  topicMap?: {
    getInstance: () => L.Map;
    onAfter?: () => void;
  };
}

export const useLocationChangeHandlers = (
  isMode2d: boolean,
  options: Options
) => {
  const { getLeafletZoom } = useLeafletZoomControls();

  const { handleTopicMapLocationChange, handleCesiumSceneChange } =
    useMapHashRouting({
      isMode2d,
      getLeafletMap: options.topicMap?.getInstance,
      getLeafletZoom,
      labels: {
        clear3d: "GPM:2D:clear3d",
        write2d: "GPM:2D:writeLocation",
        topicMapLocation: "GPM:TopicMap:locationChangedHandler",
        cesiumScene: "GPM:3D",
      },
    });

  const topicMapLocationChangedHandler = useMemo(
    () =>
      createLocationChangeHandler({
        isMode2d,
        onChange: handleTopicMapLocationChange,
        onAfter: options.topicMap?.onAfter,
        onMismatch: () =>
          console.debug(
            "[TopicMap|DEBUG] Location changed handler triggered while in 3D mode"
          ),
      }),
    [isMode2d, handleTopicMapLocationChange, options.topicMap?.onAfter]
  );

  // cesiumSceneChange callbacks
  const cesiumLocationChangedHandler = (e: {
    hashParams: Record<string, string>;
  }) => {
    if (isMode2d) {
      console.debug(
        "[CESIUM|DEBUG|CESIUM_WARN] Cesium scene change triggered while in 2D mode"
      );
      return;
    }
    handleCesiumSceneChange(e);
  };

  return {
    topicMapLocationChangedHandler,
    cesiumLocationChangedHandler,
  };
};
