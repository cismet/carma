import { useCallback, useEffect, MutableRefObject } from "react";
import { Map as LeafletMap } from "leaflet";
import { Map as MaplibreMap } from "maplibre-gl";

import { LeafletMapEventNames } from "@carma-mapping/engines/leaflet";
import { MaplibreMapEventNames } from "@carma-mapping/engines/maplibre";

import type { LatLngZoom } from "./useMapHashRoutingLeafletLike";
import {
  setViewLeafletLike,
  LeafletLikeMap,
} from "../utils/leafletLikeMapUtils";

type HashStateSubscriber = (
  callback: (e: { source: string; values: Record<string, unknown> }) => void,
  options?: { keys?: string[] }
) => () => void;

const CLEAR_LEAFLET_EVENTS = [
  LeafletMapEventNames.moveend,
  LeafletMapEventNames.zoomend,
] as const;

const CLEAR_MAPLIBRE_EVENTS = [
  MaplibreMapEventNames.moveend,
  MaplibreMapEventNames.zoomend,
] as const;

/**
 * Defers execution to the next event loop tick.
 * Ensures all synchronous handlers and microtasks complete before running.
 */
const deferToNextTick = (fn: () => void): void => {
  setTimeout(fn, 0);
};

const onceOnMoveEndLikeForLeafletLikeMap = (
  map: LeafletLikeMap,
  handler: () => void
): void => {
  if (map instanceof LeafletMap) {
    CLEAR_LEAFLET_EVENTS.forEach((evt) => map.once(evt, handler));
    return;
  }
  if (map instanceof MaplibreMap) {
    CLEAR_MAPLIBRE_EVENTS.forEach((evt) => map.once(evt, handler));
    return;
  }
  console.warn(
    "[Routing][hash] popstate scheduleClear failed: unsupported map instance"
  );
};

interface UseLeafletLikePopstateNavigationHandlerOptions {
  enabled: boolean;
  subscribe: HashStateSubscriber;
  getLeafletLikeMap?: () => LeafletLikeMap | null | undefined;
  getLeafletLikeZoom?: () => number;
  navMoveInProgressRef: MutableRefObject<boolean>;
  popstateTargetRef: MutableRefObject<LatLngZoom | null>;
}

/**
 * Handles browser back/forward navigation by restoring the 2D map to historical locations
 * without writing new hash entries. Prevents feedback loops during popstate-driven navigation.
 */
export function useLeafletLikePopstateNavigationHandler({
  enabled,
  subscribe,
  getLeafletLikeMap,
  getLeafletLikeZoom,
  navMoveInProgressRef,
  popstateTargetRef,
}: UseLeafletLikePopstateNavigationHandlerOptions): void {
  const clearOnMoveEndLike = useCallback(() => {
    deferToNextTick(() => {
      navMoveInProgressRef.current = false;
      popstateTargetRef.current = null;
      console.info("[Routing][hash] popstate end -> resume 2D writes");
    });
  }, [navMoveInProgressRef, popstateTargetRef]);

  useEffect(() => {
    if (!enabled) return;
    if (!getLeafletLikeMap) return;

    const handlePopstateNavigation = (e: {
      source: string;
      values: Record<string, unknown>;
    }) => {
      if (e.source !== "popstate") return;

      const lat = e.values.lat as number | undefined;
      const lng = e.values.lng as number | undefined;
      const zoom =
        (e.values.zoom as number | undefined) ?? getLeafletLikeZoom?.();

      if (lat == null || lng == null || zoom == null) return;

      const map = getLeafletLikeMap?.();
      if (!map) return;

      navMoveInProgressRef.current = true;
      popstateTargetRef.current = { lat, lng, zoom };

      console.debug("[Routing][hash] popstate begin -> restore 2D view", {
        lat,
        lng,
        zoom,
      });

      onceOnMoveEndLikeForLeafletLikeMap(map, clearOnMoveEndLike);
      setViewLeafletLike(map, { lat, lng, zoom });
    };

    const unsub = subscribe(handlePopstateNavigation, {
      keys: ["lat", "lng", "zoom"],
    });

    return unsub;
  }, [
    enabled,
    subscribe,
    getLeafletLikeMap,
    getLeafletLikeZoom,
    clearOnMoveEndLike,
    navMoveInProgressRef,
    popstateTargetRef,
  ]);
}
