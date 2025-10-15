import { useCallback, useEffect, useRef, type MutableRefObject } from "react";

import type { Latitude, Longitude } from "@carma/geo/types";
import { cesiumClearParamKeys } from "@carma-mapping/engines/cesium";
import {
  useCarmaTopicMapContext,
  TopicMapCtxEvent,
} from "@carma-mapping/engines/carma-cismap";
import { isMapCenterZoomEquivalent } from "@carma/geo/utils";

import { useHashState } from "../contexts/HashStateProvider";
import {
  getLatLngZoomFromLeafletLike,
  type LatLngZoom,
} from "../utils/leafletLikeMapUtils";

interface UseLeafletLikeChangeHandlerOptions {
  navMoveInProgressRef: MutableRefObject<boolean>;
  popstateTargetRef: MutableRefObject<LatLngZoom | null>;
  cesiumClearKeys?: string[];
  label?: string;
  pixelTolerance?: number;
  onAfterLocationChanged?: () => void;
}

/**
 * Hook that creates a handler for Leaflet-like map location changes that writes to the URL hash.
 * Implements tolerance-based deduplication to avoid writing nearly identical coordinates.
 */
export function useLeafletLikeChangeHandler({
  navMoveInProgressRef,
  popstateTargetRef,
  cesiumClearKeys = cesiumClearParamKeys,
  label,
  pixelTolerance,
  onAfterLocationChanged,
}: UseLeafletLikeChangeHandlerOptions) {
  const { updateHash, getHashValues } = useHashState();
  const { subscribe, isSuspendedRef } = useCarmaTopicMapContext();

  // Subscribe to TopicMap context events
  useEffect(() => {
    const unsubActive = subscribe(TopicMapCtxEvent.Activate, () => {
      console.debug("[TopicMapHashRouting] TopicMap active");
    });
    const unsubSuspended = subscribe(TopicMapCtxEvent.Suspend, () => {
      console.debug("[TopicMapHashRouting] TopicMap suspended");
    });
    return () => {
      unsubActive();
      unsubSuspended();
    };
  }, [subscribe]);

  return useCallback(
    ({ lat, lng, zoom }: LatLngZoom) => {
      // Don't update hash if TopicMap is suspended (in 3D mode)
      if (isSuspendedRef.current) {
        console.debug("[Routing][hash] (2D) skip: TopicMap suspended", {
          lat,
          lng,
          zoom,
          label,
        });
        return;
      }

      // Skip writes during popstate-driven navigation to prevent feedback loops
      if (navMoveInProgressRef.current) {
        console.debug(
          "[Routing][hash] (2D) suppress push: popstate navigation in progress",
          { lat, lng, zoom, label }
        );
        return;
      }

      // If we just restored to a target via popstate, allow small drift without pushing
      const target = popstateTargetRef.current;
      if (target) {
        const eq = isMapCenterZoomEquivalent(
          {
            center: {
              latitude: lat as Latitude.deg,
              longitude: lng as Longitude.deg,
            },
            zoom,
          },
          {
            center: {
              latitude: target.lat as Latitude.deg,
              longitude: target.lng as Longitude.deg,
            },
            zoom: target.zoom,
          },
          { pixelTolerance }
        );
        if (eq) {
          console.debug(
            "[Routing][hash] (2D) skip push: equals popstate target within tolerance",
            { lat, lng, zoom, target }
          );
          popstateTargetRef.current = null;
          return;
        }
      }

      // Skip writing if the map is already at the current hash location (within tolerance)
      try {
        const vals = getHashValues?.() || {};
        const hLat = Number(
          (vals as Record<string, unknown>).lat
        ) as Latitude.deg;
        const hLng = Number(
          (vals as Record<string, unknown>).lng
        ) as Longitude.deg;
        const hZoom = Number((vals as Record<string, unknown>).zoom) as number;
        const hasAll =
          Number.isFinite(hLat) &&
          Number.isFinite(hLng) &&
          Number.isFinite(hZoom);
        if (hasAll) {
          const eq = isMapCenterZoomEquivalent(
            {
              center: {
                latitude: lat as Latitude.deg,
                longitude: lng as Longitude.deg,
              },
              zoom,
            },
            {
              center: { latitude: hLat, longitude: hLng },
              zoom: hZoom,
            },
            { pixelTolerance }
          );
          if (eq) {
            console.debug(
              "[Routing][hash] (2D) skip push: equals current hash within tolerance",
              { lat, lng, zoom, hLat, hLng, hZoom }
            );
            return;
          }
        }
      } catch {}

      onAfterLocationChanged?.();
      updateHash(
        { lat, lng, zoom },
        {
          clearKeys: cesiumClearKeys,
          label: `${label ?? "LeafletLike Map Change"}:hashUpdate`,
          replace: false,
        }
      );
    },
    [
      navMoveInProgressRef,
      popstateTargetRef,
      getHashValues,
      updateHash,
      cesiumClearKeys,
      label,
      pixelTolerance,
      onAfterLocationChanged,
    ]
  );
}
