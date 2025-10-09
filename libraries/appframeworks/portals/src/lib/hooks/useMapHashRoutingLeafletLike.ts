import { useRef } from "react";
import { Map as LeafletMap } from "leaflet";
import { Map as MaplibreMap } from "maplibre-gl";

import { cesiumClearParamKeys } from "@carma-mapping/engines/cesium";

import { useHashState } from "../contexts/HashStateProvider";
import { useLeafletLikePopstateNavigationHandler } from "./useLeafletLikePopstateNavigationHandler";
import { useLeafletLikeChangeHandler } from "./useLeafletLikeChangeHandler";

export type LatLngZoom = { lat: number; lng: number; zoom: number };

type LeafletLikeMap = LeafletMap | MaplibreMap;

interface UseMapHashRoutingLeafletLikeOptions {
  getLeafletLikeMap?: () => LeafletLikeMap | null | undefined;
  getLeafletLikeZoom?: () => number;
  cesiumClearKeys?: string[];
  label?: string;
  pixelTolerance?: number; // px
  onAfterLocationChanged?: () => void;
}

const noop = () => {};

export function useMapHashRoutingLeafletLike(
  enabled: boolean,
  {
    getLeafletLikeMap,
    getLeafletLikeZoom,
    cesiumClearKeys = cesiumClearParamKeys,
    label,
    pixelTolerance,
    onAfterLocationChanged,
  }: UseMapHashRoutingLeafletLikeOptions
) {
  const { subscribe } = useHashState();

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

  // Back/forward navigation: move the 2D map to the historical location without writing a new hash
  useLeafletLikePopstateNavigationHandler({
    enabled,
    subscribe,
    getLeafletLikeMap,
    getLeafletLikeZoom,
    navMoveInProgressRef,
    popstateTargetRef,
  });

  return enabled ? handleTopicMapLocationChange : noop;
}
