import { zoom256as512 } from "@carma-mapping/engines/maplibre";
import { useCallback, useEffect, useRef } from "react";
import { Map as LeafletMap } from "leaflet";
import { Map as MaplibreMap } from "maplibre-gl";

import { Degrees, Zoom256 } from "@carma/types";
import { isMapCenterZoomEquivalent } from "@carma-commons/utils";
import { cesiumClearParamKeys } from "@carma-mapping/engines/cesium";

import { useHashState } from "../contexts/HashStateProvider";

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

export const getLatLngZoomFromLeafletLike = (
  map: LeafletLikeMap
): LatLngZoom => {
  const center = map.getCenter();
  const zoom = map.getZoom();

  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
    throw new Error("map does not provide valid center");
  }
  if (zoom === undefined || !Number.isFinite(zoom)) {
    throw new Error("map does not provide valid zoom");
  }
  return { lat: center.lat, lng: center.lng, zoom };
};

export const setViewLeafletLike = (
  map: LeafletLikeMap,
  { lat, lng, zoom }: LatLngZoom
): void => {
  if (map instanceof MaplibreMap) {
    map.jumpTo({ center: [lng, lat], zoom: zoom256as512(zoom as Zoom256) });
  } else if (map instanceof LeafletMap) {
    map.setView({ lat, lng }, zoom);
  }
};

export const triggerLeafletLikeLocationChangeEvent = (
  map: LeafletLikeMap | null | undefined,
  handler: (latLngZoom: LatLngZoom) => void
): void => {
  if (!map) return;
  try {
    const latLngZoom = getLatLngZoomFromLeafletLike(map);
    handler(latLngZoom);
  } catch {
    console.warn("Triggering location change event failed");
  }
};

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

  // Shared handler for clearing navigation state
  const sharedClearHandler = useCallback(() => {
    setTimeout(() => {
      navMoveInProgressRef.current = false;
      popstateTargetRef.current = null;
      console.debug("[Routing][hash] popstate end -> resume 2D writes");
    }, 0);
  }, []);

  // Back/forward navigation: move the 2D map to the historical location without writing a new hash
  useEffect(() => {
    if (!enabled) return;
    if (!getLeafletLikeMap) return;
    const unsub = subscribe(
      (e) => {
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
        const scheduleClear = (evt: string) => {
          if (map instanceof LeafletMap) {
            map.once(evt, sharedClearHandler);
          } else if (map instanceof MaplibreMap) {
            map.once(evt, sharedClearHandler);
          } else {
            console.warn("unhandled Map Framework");
          }
        };
        scheduleClear("moveend");
        scheduleClear("zoomend");
        setViewLeafletLike(map, { lat, lng, zoom });
      },
      { keys: ["lat", "lng", "zoom"] }
    );
    return unsub;
  }, [
    enabled,
    subscribe,
    getLeafletLikeMap,
    getLeafletLikeZoom,
    sharedClearHandler,
  ]);

  return enabled ? handleTopicMapLocationChange : noop;
}
