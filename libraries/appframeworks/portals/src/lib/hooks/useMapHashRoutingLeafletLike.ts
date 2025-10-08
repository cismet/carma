import { useCallback, useEffect, useRef } from "react";

import { Degrees } from "@carma/types";
import { isMapCenterZoomEquivalent } from "@carma-commons/utils";
import { cesiumClearParamKeys } from "@carma-mapping/engines/cesium";

import { useHashState } from "../contexts/HashStateProvider";

export type LatLngZoom = { lat: number; lng: number; zoom: number };

type LeafletLikeMap = {
  setView?: (center: { lat: number; lng: number }, zoom?: number) => void;
  panTo?: (center: { lat: number; lng: number }) => void;
  setZoom?: (zoom: number) => void;
  getCenter?: () => { lat: number; lng: number };
  once?: (type: string, fn: (...args: unknown[]) => void) => void;
};

interface UseMapHashRoutingLeafletLikeOptions {
  getLeafletMap?: () => LeafletLikeMap | null | undefined;
  getLeafletZoom?: () => number;
  cesiumClearKeys?: string[];
  label?: string;
  pixelTolerance?: number; // px
  onAfterLocationChanged?: () => void;
}

export function useMapHashRoutingLeafletLike({
  getLeafletMap,
  getLeafletZoom,
  cesiumClearKeys = cesiumClearParamKeys,
  label,
  pixelTolerance,
  onAfterLocationChanged,
}: UseMapHashRoutingLeafletLikeOptions) {
  const { updateHash, subscribe, getHashValues } = useHashState();

  // Skip 2D writes when the map move was initiated by a navigation (popstate)
  const navMoveInProgressRef = useRef(false);
  // Remember the popstate target to avoid immediate re-pushing nearly identical coords
  const popstateTargetRef = useRef<LatLngZoom | null>(null);

  const handleTopicMapLocationChange = useCallback(
    ({ lat, lng, zoom }: LatLngZoom) => {
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
            center: { latitude: lat as Degrees, longitude: lng as Degrees },
            zoom,
          },
          {
            center: {
              latitude: target.lat as Degrees,
              longitude: target.lng as Degrees,
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
        const hLat = Number((vals as Record<string, unknown>).lat) as Degrees;
        const hLng = Number((vals as Record<string, unknown>).lng) as Degrees;
        const hZoom = Number((vals as Record<string, unknown>).zoom) as number;
        const hasAll =
          Number.isFinite(hLat) &&
          Number.isFinite(hLng) &&
          Number.isFinite(hZoom);
        if (hasAll) {
          const eq = isMapCenterZoomEquivalent(
            {
              center: { latitude: lat as Degrees, longitude: lng as Degrees },
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
      updateHash,
      getHashValues,
      cesiumClearKeys,
      label,
      pixelTolerance,
      onAfterLocationChanged,
    ]
  );

  // Back/forward navigation: move the 2D map to the historical location without writing a new hash
  useEffect(() => {
    if (!getLeafletMap) return;
    const unsub = subscribe(
      (e) => {
        if (e.source !== "popstate") return;
        const lat = e.values.lat as number | undefined;
        const lng = e.values.lng as number | undefined;
        const zoom =
          (e.values.zoom as number | undefined) ?? getLeafletZoom?.();
        if (lat == null || lng == null || zoom == null) return;
        const map = getLeafletMap?.();
        if (!map) return;
        navMoveInProgressRef.current = true;
        popstateTargetRef.current = { lat, lng, zoom };
        console.debug("[Routing][hash] popstate begin -> restore 2D view", {
          lat,
          lng,
          zoom,
        });
        const scheduleClear = (evt: string) => {
          if (typeof map.once === "function") {
            map.once(evt, () => {
              setTimeout(() => {
                navMoveInProgressRef.current = false;
                console.debug(
                  "[Routing][hash] popstate end -> resume 2D writes",
                  { via: evt }
                );
              }, 0);
            });
          }
        };
        scheduleClear("moveend");
        scheduleClear("zoomend");
        if (typeof map.setView === "function") {
          map.setView({ lat, lng }, zoom);
        } else if (typeof map.panTo === "function") {
          map.panTo({ lat, lng });
          if (typeof map.setZoom === "function") map.setZoom(zoom);
        }
      },
      { keys: ["lat", "lng", "zoom"] }
    );
    return unsub;
  }, [subscribe, getLeafletMap, getLeafletZoom]);

  return handleTopicMapLocationChange;
}
