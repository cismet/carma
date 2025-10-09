import { useCallback, useContext, useEffect, useMemo } from "react";
import * as L from "leaflet";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useMapHashRoutingLeafletLike } from "@carma-appframeworks/portals";

export const useTopicMapLocationChangedHandler = (
  enabled: boolean,
  onAfterLocationChanged?: () => void
) => {
  const { routedMapRef: topicMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  const getTopicMap = useCallback(
    () => topicMap?.leafletMap?.leafletElement as L.Map | undefined,
    [topicMap]
  );

  const handlerOptions = useMemo(
    () => ({
      leafletLikeMap: getTopicMap(),
      onAfterLocationChanged,
      label: "GPM:TopicMap:locationChangedHandler",
    }),
    [getTopicMap, onAfterLocationChanged]
  );

  const handleTopicMapLocationChange = useMapHashRoutingLeafletLike(
    enabled,
    handlerOptions
  );

  return handleTopicMapLocationChange;
};
