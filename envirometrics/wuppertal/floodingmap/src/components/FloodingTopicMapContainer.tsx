import { useCallback, useContext, useMemo, type ComponentProps } from "react";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";

import { useMapHashRouting } from "@carma-appframeworks/portals";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { useCesiumContext } from "@carma-mapping/engines/cesium/react/runtime";
type TopicMapComponentProps = ComponentProps<typeof TopicMapComponent>;

const HASH_ROUTING_LABELS = {
  writeLeafletLike: "app/hgk:2D:writeLocation",
  topicMapLocation: "app/hgk:2D:location",
};

export const FloodingTopicMapContainer = (props: TopicMapComponentProps) => {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const forwardedLocationChangedHandler = props.locationChangedHandler;
  const { getIsTransitioning, getIsCesium } = useMapFrameworkSwitcherContext();
  const { initialViewApplied } = useCesiumContext();

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
      isHashWriteEnabled: () => {
        if (getIsTransitioning()) {
          return false;
        }

        if (getIsCesium()) {
          return initialViewApplied;
        }

        return true;
      },
      labels: HASH_ROUTING_LABELS,
    }),
    [
      getLeafletMap,
      getLeafletZoom,
      getIsTransitioning,
      getIsCesium,
      initialViewApplied,
    ]
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
      disableUseLocation={true}
      locationChangedHandler={handleLocationChanged}
      outerLocationChangedHandlerExclusive={true}
    />
  );
};

export default FloodingTopicMapContainer;
