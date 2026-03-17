import { useCallback, useContext, useMemo, type ComponentProps } from "react";

import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { useMapHashRouting } from "@carma-appframeworks/portals";

type TopicMapComponentProps = ComponentProps<typeof TopicMapComponent>;

const HASH_ROUTING_LABELS = {
  clearCesium: "app/hgk:2D:clearCesium",
  writeLeafletLike: "app/hgk:2D:writeLocation",
  topicMapLocation: "app/hgk:2D:location",
};

export const FloodingTopicMapContainer = (props: TopicMapComponentProps) => {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const forwardedLocationChangedHandler = props.locationChangedHandler;

  const getLeafletMap = useCallback(
    () => routedMapRef?.leafletMap?.leafletElement ?? null,
    [routedMapRef]
  );

  const getLeafletZoom = useCallback(
    () => routedMapRef?.leafletMap?.leafletElement?.getZoom() ?? 0,
    [routedMapRef]
  );

  const routingOptions = useMemo(
    () => ({
      getLeafletMap,
      getLeafletZoom,
      labels: HASH_ROUTING_LABELS,
    }),
    [getLeafletMap, getLeafletZoom]
  );

  const { handleTopicMapLocationChange } = useMapHashRouting(routingOptions);

  const handleLocationChanged = useCallback(
    (location: { lat: number; lng: number; zoom: number }) => {
      handleTopicMapLocationChange(location);
      forwardedLocationChangedHandler?.(location);
    },
    [handleTopicMapLocationChange, forwardedLocationChangedHandler]
  );

  return (
    <TopicMapComponent
      {...props}
      locationChangedHandler={handleLocationChanged}
      outerLocationChangedHandlerExclusive={true}
    />
  );
};

export default FloodingTopicMapContainer;