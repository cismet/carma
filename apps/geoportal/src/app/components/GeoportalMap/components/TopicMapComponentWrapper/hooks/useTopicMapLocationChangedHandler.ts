import { useMemo } from "react";
import * as L from "leaflet";

import {
  createLocationChangeHandler,
  useMapHashRouting,
} from "@carma-appframeworks/portals";
import { useLeafletZoomControls } from "../../../../../hooks/leaflet/useLeafletZoomControls.ts";

interface TopicMapOptions {
  getInstance: () => L.Map | undefined;
  onAfter?: () => void;
}

export const useTopicMapLocationChangedHandler = (
  isMode2d: boolean,
  options: TopicMapOptions
) => {
  const { getLeafletZoom } = useLeafletZoomControls();

  const { handleTopicMapLocationChange } = useMapHashRouting({
    isMode2d,
    getLeafletMap: options.getInstance,
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
        onAfter: options.onAfter,
        onMismatch: () =>
          console.debug(
            "[TopicMap|DEBUG] Location changed handler triggered while in 3D mode"
          ),
      }),
    [isMode2d, handleTopicMapLocationChange, options.onAfter]
  );

  return topicMapLocationChangedHandler;
};
