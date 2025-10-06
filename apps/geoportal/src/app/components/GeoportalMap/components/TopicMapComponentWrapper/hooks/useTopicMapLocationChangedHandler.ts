import { useCallback, useContext, useEffect, useRef } from "react";

import * as L from "leaflet";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import {
  createLocationChangeHandler,
  useMapHashRouting,
} from "@carma-appframeworks/portals";
import { selectViewerIsMode2d } from "@carma-mapping/engines/cesium";

import { useLeafletZoomControls } from "../../../../../hooks/leaflet/useLeafletZoomControls.ts";
import {
  getLayersIdle,
  setLayersIdle,
} from "../../../../../store/slices/mapping";
import { useDispatch, useSelector } from "react-redux";

export const useTopicMapLocationChangedHandler = () => {
  const dispatch = useDispatch();
  const { routedMapRef: topicMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  const getTopicMap = useCallback(
    () => topicMap?.leafletMap?.leafletElement as L.Map | undefined,
    [topicMap]
  );

  const { getLeafletZoom } = useLeafletZoomControls();

  const isMode2d = useSelector(selectViewerIsMode2d);
  const layersIdle = useSelector(getLayersIdle);

  const updateLayersIdleState = useCallback(() => {
    if (layersIdle) {
      dispatch(setLayersIdle(false));
    }
  }, [layersIdle, dispatch]);

  const { handleTopicMapLocationChange } = useMapHashRouting({
    isMode2d,
    getLeafletMap: getTopicMap,
    getLeafletZoom,
    labels: {
      clear3d: "GPM:2D:clear3d",
      write2d: "GPM:2D:writeLocation",
      topicMapLocation: "GPM:TopicMap:locationChangedHandler",
      cesiumScene: "GPM:3D",
    },
  });

  const handler = createLocationChangeHandler(true, {
    onChange: handleTopicMapLocationChange,
    onAfter: updateLayersIdleState,
    onMismatch: () =>
      console.debug(
        "[TopicMap|DEBUG] Location changed handler triggered while in 3D mode"
      ),
  });

  // Internal handler ref that can be swapped without changing outward identity
  const handlerRef = useRef<ReturnType<
    typeof createLocationChangeHandler
  > | null>(null);
  useEffect(() => {
    if (isMode2d === false) {
      handlerRef.current = () => {
        console.debug(
          "[TopicMap|DEBUG] Location changed handler triggered while in 3D mode"
        );
      };
      return;
    }
    handlerRef.current = handler;
  }, [handler, isMode2d]);

  // Stable function identity for TopicMapComponent
  return useCallback((e: { lat: number; lng: number; zoom: number }) => {
    handlerRef.current?.(e);
  }, []);
};
