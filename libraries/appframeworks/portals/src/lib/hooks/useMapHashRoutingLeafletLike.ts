import { useEffect, useRef } from "react";
import { Map as LeafletMap } from "leaflet";
import { Map as MaplibreMap } from "maplibre-gl";

import { cesiumClearParamKeys } from "@carma-mapping/engines/cesium";

import { useLeafletLikePopstateNavigationHandler } from "./useLeafletLikePopstateNavigationHandler";
import { useLeafletLikeChangeHandler } from "./useLeafletLikeChangeHandler";
import {
  type LeafletLikeMap,
  type LatLngZoom,
  triggerLeafletLikeLocationChangeEvent,
} from "../utils/leafletLikeMapUtils";

interface UseMapHashRoutingLeafletLikeOptions {
  leafletLikeMap: LeafletLikeMap;
  cesiumClearKeys?: string[];
  label?: string;
  pixelTolerance?: number; // px
  onAfterLocationChanged?: () => void;
}

const noop = () => {};

export function useMapHashRoutingLeafletLike(
  enabled: boolean,
  {
    leafletLikeMap,
    cesiumClearKeys = cesiumClearParamKeys,
    label,
    pixelTolerance,
    onAfterLocationChanged,
  }: UseMapHashRoutingLeafletLikeOptions
) {
  // Skip 2D writes when the map move was initiated by a navigation (popstate)
  const navMoveInProgressRef = useRef(false);
  // Remember the popstate target to avoid immediate re-pushing nearly identical coords
  const popstateTargetRef = useRef<LatLngZoom | null>(null);

  const handleTopicMapLocationChange = useLeafletLikeChangeHandler({
    navMoveInProgressRef,
    popstateTargetRef,
    cesiumClearKeys,
    label,
    pixelTolerance,
    onAfterLocationChanged,
  });

  // Trigger synthetic location change when enabling
  useEffect(() => {
    if (enabled) {
      triggerLeafletLikeLocationChangeEvent(
        leafletLikeMap,
        handleTopicMapLocationChange
      );
    }
  }, [enabled, leafletLikeMap, handleTopicMapLocationChange]);

  // Back/forward navigation: move the 2D map to the historical location without writing a new hash
  useLeafletLikePopstateNavigationHandler({
    enabled,
    leafletLikeMap,
    navMoveInProgressRef,
    popstateTargetRef,
  });

  return enabled ? handleTopicMapLocationChange : noop;
}
