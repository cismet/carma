import { useCallback, useEffect, useRef } from "react";
import { useHashState } from "@carma-providers/hash-state";

import { cesiumClearParamKeys } from "@carma-mapping/engines/cesium";
import { isMapCenterZoomEquivalent } from "@carma/geo/utils";
import { Degrees } from "@carma/units/types";

export type LatLngZoom = { lat: number; lng: number; zoom: number };
export type CesiumSceneChangeEvent = { hashParams: Record<string, string> };

type Labels = {
  clearCesium?: string;
  writeLeafletLike?: string;
  topicMapLocation?: string;
  cesiumScene?: string;
};

type LeafletLikeMap = {
  setView?: (center: { lat: number; lng: number }, zoom?: number) => void;
  panTo?: (center: { lat: number; lng: number }) => void;
  setZoom?: (zoom: number) => void;
  getCenter?: () => { lat: number; lng: number };
  once?: (type: string, fn: (...args: unknown[]) => void) => void;
};

export interface UseMapHashRoutingOptions {
  isLeafletLike: boolean;
  getLeafletMap?: () => LeafletLikeMap | null | undefined;
  getLeafletZoom?: () => number;
  cesiumClearKeys?: string[];
  labels?: Labels;
  pixelTolerance?: number; // px
}

export function useMapHashRouting({
  isLeafletLike,
  getLeafletMap,
  getLeafletZoom,
  cesiumClearKeys = cesiumClearParamKeys,
  labels,
  pixelTolerance,
}: UseMapHashRoutingOptions) {
  const { updateHash, subscribe, getHashValues } = useHashState();

  // Skip leaflet writes when the map move was initiated by a navigation (popstate)
  const navMoveInProgressRef = useRef(false);
  // Remember the popstate target to avoid immediate re-pushing nearly identical coords
  const popstateTargetRef = useRef<LatLngZoom | null>(null);

  const handleTopicMapLocationChange = useCallback(
    ({ lat, lng, zoom }: LatLngZoom) => {
      console.debug("[Routing][hash]", lat, lng, zoom);
      if (!isLeafletLike) return;
      if (navMoveInProgressRef.current) {
        console.debug(
          "[Routing][hash] (Leaflet) suppress push: popstate navigation in progress",
          {
            lat,
            lng,
            zoom,
            label: labels?.topicMapLocation ?? "Map:LeafletLike:location",
          }
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
            "[Routing][hash] (Leaflet) skip push: equals popstate target within tolerance",
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
              "[Routing][hash] (LeafletLike) skip push: equals current hash within tolerance",
              { lat, lng, zoom, hLat, hLng, hZoom }
            );
            return;
          }
        }
      } catch {}
      updateHash(
        { lat, lng, zoom },
        {
          clearKeys: cesiumClearKeys,
          label: labels?.topicMapLocation ?? "Map:2D:location",
          replace: false,
        }
      );
    },
    [
      isLeafletLike,
      updateHash,
      getHashValues,
      cesiumClearKeys,
      labels?.topicMapLocation,
      pixelTolerance,
    ]
  );

  const handleCesiumSceneChange = useCallback(
    (e: CesiumSceneChangeEvent) => {
      if (isLeafletLike) return;
      updateHash(e.hashParams, {
        clearKeys: ["zoom"],
        label: labels?.cesiumScene ?? "Map:3D:scene",
        replace: true, // don't push to history until cesium handled history navigation
      });
    },
    [isLeafletLike, updateHash, labels?.cesiumScene]
  );

  const prevIsModeLeafletLikeRef = useRef<boolean>(isLeafletLike);
  useEffect(() => {
    const wasLeafletLike = prevIsModeLeafletLikeRef.current;
    if (!wasLeafletLike && isLeafletLike) {
      // Replace current entry to clear 3D-specific state
      updateHash(undefined, {
        clearKeys: cesiumClearKeys,
        label: labels?.clearCesium ?? "Map:2D:clearCesium",
        replace: true,
      });
      // Then push current 2D location
      const map = getLeafletMap?.();
      if (
        map &&
        typeof map.getCenter === "function" &&
        typeof getLeafletZoom === "function"
      ) {
        const center = map.getCenter();
        const zoom = getLeafletZoom();
        updateHash(
          { lat: center.lat, lng: center.lng, zoom },
          { label: labels?.writeLeafletLike ?? "Map:2D:writeLocation" }
        );
      }
    }
    prevIsModeLeafletLikeRef.current = isLeafletLike;
  }, [
    isLeafletLike,
    updateHash,
    getLeafletMap,
    getLeafletZoom,
    cesiumClearKeys,
    labels?.clearCesium,
    labels?.writeLeafletLike,
  ]);

  // Back/forward navigation: move the leaflet map to the historical location without writing a new hash
  useEffect(() => {
    if (!getLeafletMap) return;
    const unsub = subscribe(
      (e) => {
        if (e.source !== "popstate") return;
        if (!isLeafletLike) return;
        const lat = e.values.lat as number | undefined;
        const lng = e.values.lng as number | undefined;
        const zoomFromHash = e.values.zoom as number | undefined;
        const fallbackZoom = getLeafletZoom?.();
        const zoom = zoomFromHash ?? fallbackZoom;

        console.warn("[Routing][hash] POPSTATE ZOOM DEBUG:", {
          zoomFromHash,
          fallbackZoom,
          finalZoom: zoom,
          hashValues: e.values,
          source: e.source,
        });

        if (lat == null || lng == null || zoom == null) return;
        const map = getLeafletMap?.();
        if (!map) return;
        navMoveInProgressRef.current = true;
        popstateTargetRef.current = { lat, lng, zoom };
        console.debug(
          "[Routing][hash] popstate begin -> restore leaflet view",
          {
            lat,
            lng,
            zoom,
          }
        );
        const scheduleClear = (evt: string) => {
          if (typeof map.once === "function") {
            map.once(evt, () => {
              setTimeout(() => {
                navMoveInProgressRef.current = false;
                console.debug(
                  "[Routing][hash] popstate end -> resume leaflet writes",
                  { via: evt }
                );
              }, 0);
            });
          }
        };
        scheduleClear("moveend");
        scheduleClear("zoomend");
        console.warn("[Routing][hash] CALLING map.setView", {
          lat,
          lng,
          zoom,
          stack: new Error().stack,
        });
        if (typeof map.setView === "function") {
          map.setView({ lat, lng }, zoom);
        } else if (typeof map.panTo === "function") {
          map.panTo({ lat, lng });
          if (typeof map.setZoom === "function") {
            console.warn("[Routing][hash] CALLING map.setZoom", {
              zoom,
              stack: new Error().stack,
            });
            map.setZoom(zoom);
          }
        }
      },
      { keys: ["lat", "lng", "zoom"] }
    );
    return unsub;
  }, [subscribe, isLeafletLike, getLeafletMap, getLeafletZoom]);

  return { handleTopicMapLocationChange, handleCesiumSceneChange };
}
