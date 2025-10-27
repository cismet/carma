import { useCallback, useEffect, MutableRefObject } from "react";
import {
  LeafletMap,
  LeafletMapEventNames,
} from "@carma-mapping/engines/leaflet";
import {
  MaplibreMap,
  MaplibreMapEventNames,
} from "@carma-mapping/engines/maplibre";

import { useHashState } from "../contexts/HashStateProvider";
import {
  setViewLeafletLike,
  type LeafletLikeMap,
  type LatLngZoom,
} from "../utils/leafletLikeMapUtils";

const CLEAR_LEAFLET_EVENTS = [
  LeafletMapEventNames.moveend,
  LeafletMapEventNames.zoomend,
] as const;

const CLEAR_MAPLIBRE_EVENTS = [
  MaplibreMapEventNames.moveend,
  MaplibreMapEventNames.zoomend,
] as const;

/**
 * Defers execution to the next animation frame.
 * Ensures all map rendering and visual updates complete before running.
 */
const deferToNextFrame = (fn: () => void): void => {
  window.requestAnimationFrame(() => fn());
};

const onceOnMoveEndLikeForLeafletLikeMap = (
  map: LeafletLikeMap,
  handler: () => void
): void => {
  if (map instanceof LeafletMap) {
    // Leaflet: wait for BOTH moveend AND zoomend before clearing
    let firedCount = 0;
    const expectedCount = CLEAR_LEAFLET_EVENTS.length;

    const wrappedHandler = () => {
      firedCount++;
      if (firedCount === expectedCount) {
        CLEAR_LEAFLET_EVENTS.forEach((evt) =>
          map.off(evt, wrappedHandler as never)
        );
        handler();
      }
    };
    CLEAR_LEAFLET_EVENTS.forEach((evt) => map.on(evt, wrappedHandler as never));
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
  leafletLikeMap: LeafletLikeMap;
  navMoveInProgressRef: MutableRefObject<boolean>;
  popstateTargetRef: MutableRefObject<LatLngZoom | null>;
}

/**
 * Handles browser back/forward navigation by restoring the 2D map to historical locations
 * without writing new hash entries. Prevents feedback loops during popstate-driven navigation.
 */
export function useLeafletLikePopstateNavigationHandler({
  enabled,
  leafletLikeMap,
  navMoveInProgressRef,
  popstateTargetRef,
}: UseLeafletLikePopstateNavigationHandlerOptions): void {
  const { subscribe } = useHashState();

  const clearOnMoveEndLike = useCallback(() => {
    deferToNextFrame(() => {
      navMoveInProgressRef.current = false;
      popstateTargetRef.current = null;
      console.info("[Routing][hash] popstate end -> resume 2D writes");
    });
  }, [navMoveInProgressRef, popstateTargetRef]);

  useEffect(() => {
    if (!enabled) return;
    if (!leafletLikeMap) return;

    const handlePopstateNavigation = (e: {
      source: string;
      values: Record<string, unknown>;
    }) => {
      if (e.source !== "popstate") return;
      if (!leafletLikeMap) return;

      const lat = e.values.lat as number | undefined;
      const lng = e.values.lng as number | undefined;
      const zoom = e.values.zoom as number | undefined;

      if (lat == null || lng == null || zoom == null) return;

      navMoveInProgressRef.current = true;
      popstateTargetRef.current = { lat, lng, zoom };

      console.debug("[Routing][hash] popstate begin -> restore 2D view", {
        lat,
        lng,
        zoom,
      });

      onceOnMoveEndLikeForLeafletLikeMap(leafletLikeMap, clearOnMoveEndLike);
      setViewLeafletLike(leafletLikeMap, { lat, lng, zoom });
    };

    const unsub = subscribe(handlePopstateNavigation, {
      keys: ["lat", "lng", "zoom"],
    });

    return unsub;
  }, [
    enabled,
    subscribe,
    leafletLikeMap,
    clearOnMoveEndLike,
    navMoveInProgressRef,
    popstateTargetRef,
  ]);
}
