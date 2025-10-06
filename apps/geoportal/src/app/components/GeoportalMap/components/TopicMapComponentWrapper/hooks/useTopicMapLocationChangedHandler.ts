import { useCallback, useContext, useMemo } from "react";

import * as L from "leaflet";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { useMapHashRoutingLeafletLike } from "@carma-appframeworks/portals";

import { useLeafletZoomControls } from "../../../../../hooks/leaflet/useLeafletZoomControls.ts";

export const useTopicMapLocationChangedHandler = () => {
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
      labels: {
        clear3d: "GPM:2D:clear3d",
        write2d: "GPM:2D:writeLocation",
        topicMapLocation: "GPM:TopicMap:locationChangedHandler",
        cesiumScene: "GPM:3D",
      },
    }),
    [getTopicMap, getLeafletZoom]
  );

  const handleTopicMapLocationChange =
    useMapHashRoutingLeafletLike(handlerOptions);

  return handleTopicMapLocationChange;
};
