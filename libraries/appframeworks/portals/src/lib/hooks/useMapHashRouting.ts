import { useCallback, useEffect, useRef } from "react";
import { useHashState } from "../contexts/HashStateProvider";

import { cesiumClearParamKeys } from "@carma-mapping/engines/cesium";
import { isLocationEqualWithinPixelTolerance } from "@carma-commons/utils";

export type LatLngZoom = { lat: number; lng: number; zoom: number };
export type CesiumSceneChangeEvent = { hashParams: Record<string, string> };

type Labels = {
  clear3d?: string;
  write2d?: string;
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
  isMode2d: boolean;
  getLeafletMap?: () => LeafletLikeMap | null | undefined;
  getLeafletZoom?: () => number;
  cesiumClearKeys?: string[];
  labels?: Labels;
  pixelTolerance?: number; // px
}

export function useMapHashRouting({
  isMode2d,
  getLeafletMap,
  getLeafletZoom,
  cesiumClearKeys = cesiumClearParamKeys,
  labels,
  pixelTolerance,
}: UseMapHashRoutingOptions) {
  const { updateHash, subscribe, getHashValues } = useHashState();

  // Skip 2D writes when the map move was initiated by a navigation (popstate)
  const navMoveInProgressRef = useRef(false);
  // Remember the popstate target to avoid immediate re-pushing nearly identical coords
  const popstateTargetRef = useRef<LatLngZoom | null>(null);

  const handleTopicMapLocationChange = useCallback(
    ({ lat, lng, zoom }: LatLngZoom) => {
      if (!isMode2d) return;
      if (navMoveInProgressRef.current) {
        console.debug(
          "[Routing][hash] (2D) suppress push: popstate navigation in progress",
          {
            lat,
            lng,
            zoom,
            label: labels?.topicMapLocation ?? "Map:2D:location",
          }
        );
        return;
      }
      // If we just restored to a target via popstate, allow small drift without pushing
      const target = popstateTargetRef.current;
      if (target) {
        if (
          isLocationEqualWithinPixelTolerance({ lat, lng, zoom }, target, {
            pixelTolerance,
            zoomTolerance: 1e-6,
          })
        ) {
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
        const hLat = Number((vals as Record<string, unknown>).lat);
        const hLng = Number((vals as Record<string, unknown>).lng);
        const hZoom = Number((vals as Record<string, unknown>).zoom);
        const h =
          Number.isFinite(hLat) &&
          Number.isFinite(hLng) &&
          Number.isFinite(hZoom)
            ? { lat: hLat, lng: hLng, zoom: hZoom }
            : undefined;
        if (
          h &&
          isLocationEqualWithinPixelTolerance({ lat, lng, zoom }, h, {
            pixelTolerance,
            zoomTolerance: 1e-6,
          })
        ) {
          console.debug(
            "[Routing][hash] (2D) skip push: equals current hash within tolerance",
            { lat, lng, zoom, hLat, hLng, hZoom }
          );
          return;
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
      isMode2d,
      updateHash,
      getHashValues,
      cesiumClearKeys,
      labels?.topicMapLocation,
      pixelTolerance,
    ]
  );

  const handleCesiumSceneChange = useCallback(
    (e: CesiumSceneChangeEvent) => {
      if (isMode2d) return;
      updateHash(e.hashParams, {
        clearKeys: ["zoom"],
        label: labels?.cesiumScene ?? "Map:3D:scene",
        replace: true,
      });
    },
    [isMode2d, updateHash, labels?.cesiumScene]
  );

  const prevIsMode2dRef = useRef<boolean>(isMode2d);
  useEffect(() => {
    const was2d = prevIsMode2dRef.current;
    if (!was2d && isMode2d) {
      // Replace current entry to clear 3D-specific state
      updateHash(undefined, {
        clearKeys: cesiumClearKeys,
        label: labels?.clear3d ?? "Map:2D:clear3d",
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
          { label: labels?.write2d ?? "Map:2D:writeLocation" }
        );
      }
    }
    prevIsMode2dRef.current = isMode2d;
  }, [
    isMode2d,
    updateHash,
    getLeafletMap,
    getLeafletZoom,
    cesiumClearKeys,
    labels?.clear3d,
    labels?.write2d,
  ]);

  // Back/forward navigation: move the 2D map to the historical location without writing a new hash
  useEffect(() => {
    if (!getLeafletMap) return;
    const unsub = subscribe(
      (e) => {
        if (e.source !== "popstate") return;
        if (!isMode2d) return;
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
  }, [subscribe, isMode2d, getLeafletMap, getLeafletZoom]);

  return { handleTopicMapLocationChange, handleCesiumSceneChange };
}

export function createLocationChangeHandler({
  isMode2d,
  onChange,
  onAfter,
  onMismatch,
}: {
  isMode2d: boolean;
  onChange: (p: LatLngZoom) => void;
  onAfter?: () => void;
  onMismatch?: () => void;
}) {
  return (p: LatLngZoom) => {
    if (!isMode2d) {
      onMismatch?.();
      return;
    }
    onChange(p);
    onAfter?.();
  };
}
