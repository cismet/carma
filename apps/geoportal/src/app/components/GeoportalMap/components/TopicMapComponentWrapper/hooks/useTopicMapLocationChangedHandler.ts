import { useMemo } from "react";
import { useCarmaTopicMapContext } from "@carma-mapping/engines/carma-cismap";
import { useMapHashRoutingLeafletLike } from "@carma-appframeworks/portals";

export const useTopicMapLocationChangedHandler = (
  onAfterLocationChanged?: () => void,
  isEnabled: boolean = true
) => {
  const { leafletMap } = useCarmaTopicMapContext();

  const handlerOptions = useMemo(
    () => ({
      leafletLikeMap: leafletMap,
      onAfterLocationChanged,
      label: "GPM:TopicMap:locationChangedHandler",
    }),
    [leafletMap, onAfterLocationChanged]
  );

  const handler = useMapHashRoutingLeafletLike(
    isEnabled, // Respect suspended state - only update hash when TopicMap is active (not suspended by Cesium)
    handlerOptions
  );

  return handler;
};
