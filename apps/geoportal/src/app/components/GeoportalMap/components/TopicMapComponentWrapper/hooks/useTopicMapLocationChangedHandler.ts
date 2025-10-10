import { useMemo } from "react";
import { useCarmaTopicMapContext } from "@carma-mapping/engines/carma-cismap";
import { useMapHashRoutingLeafletLike } from "@carma-appframeworks/portals";

export const useTopicMapLocationChangedHandler = (
  onAfterLocationChanged?: () => void
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
    true, // Always enabled
    handlerOptions
  );

  return handler;
};
