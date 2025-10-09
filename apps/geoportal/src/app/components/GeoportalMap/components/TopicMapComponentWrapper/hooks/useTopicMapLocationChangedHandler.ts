import { useCallback, useContext, useMemo } from "react";
import * as L from "leaflet";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useMapHashRoutingLeafletLike } from "@carma-appframeworks/portals";
import { useLeafletZoomControls } from "../../../../../hooks/leaflet/useLeafletZoomControls.ts";

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

  const { getLeafletZoom } = useLeafletZoomControls();

  const handlerOptions = useMemo(
    () => ({
      getLeafletLikeMap: getTopicMap,
      getLeafletLikeZoom: getLeafletZoom,
      onAfterLocationChanged,
      label: "GPM:TopicMap:locationChangedHandler",
    }),
    [getTopicMap, getLeafletZoom, onAfterLocationChanged]
  );

  const handleTopicMapLocationChange = useMapHashRoutingLeafletLike(
    enabled,
    handlerOptions
  );

  return handleTopicMapLocationChange;
};
