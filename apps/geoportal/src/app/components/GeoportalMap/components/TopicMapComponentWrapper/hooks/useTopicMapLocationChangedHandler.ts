import { useCallback, useContext, useMemo } from "react";
import * as L from "leaflet";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useMapHashRoutingLeafletLike } from "@carma-appframeworks/portals";
import { useLeafletZoomControls } from "../../../../../hooks/leaflet/useLeafletZoomControls.ts";

export const useTopicMapLocationChangedHandler = (
  isEnabledCallback: () => boolean,
  onAfterLocationChanged?: () => void
) => {
  const { routedMapRef: topicMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  const getTopicMap = useCallback(
    () => topicMap?.leafletMap?.leafletElement as L.Map | undefined,
    [topicMap]
  );

  const { getLeafletZoom } = useLeafletZoomControls();

  const handlerOptions = useMemo(
    () => ({
      getLeafletMap: getTopicMap,
      getLeafletZoom,
      onAfterLocationChanged,
      label: "GPM:TopicMap:locationChangedHandler",
    }),
    [getTopicMap, getLeafletZoom, onAfterLocationChanged]
  );

  const handleTopicMapLocationChange =
    useMapHashRoutingLeafletLike(handlerOptions);

  const stableHandler = useCallback(
    (e: { lat: number; lng: number; zoom: number }) => {
      // Instrumentation: prove handler invocation context without causing re-renders
      const isEnabled = isEnabledCallback();
      if (!isEnabled) {
        console.debug(
          "[TopicMap|DEBUG] location Changed handler currently disabled, skip update"
        );
        return;
      }
      handleTopicMapLocationChange(e);
    },
    [handleTopicMapLocationChange, isEnabledCallback]
  );
  return stableHandler;
};
