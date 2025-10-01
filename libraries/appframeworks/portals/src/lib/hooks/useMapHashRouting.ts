import { useCallback, useEffect, useRef } from "react";

import L from "leaflet";

import { useHashState } from "../contexts/HashStateProvider";

import { cesiumClearParamKeys } from "@carma-mapping/engines/cesium";
import { isMapCenterZoomEquivalent, isZoom } from "@carma-commons/utils";
import { Degrees, LatLngZoom, Zoom256 } from "@carma/types";

export type CesiumSceneChangeEvent = { hashParams: Record<string, string> };

type Labels = {
  clear3d?: string;
  write2d?: string;
  topicMapLocation?: string;
  cesiumScene?: string;
};
export interface UseMapHashRoutingOptions {
  isMode2d: boolean;
  getLatLngZoom: () => LatLngZoom; // always leaflet zoom with base tilesize of 256
  setView: (p: LatLngZoom) => void;
  mapOnce: (p: string, cb: () => void) => void;
  cesiumClearKeys?: string[];
  labels?: Labels;
  pixelTolerance?: number; // px
}

export function useMapHashRouting({
  isMode2d,
  getLatLngZoom,
  setView,
  mapOnce,
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
    (topicMapChangePayload: { lat: number; lng: number; zoom: number }) => {
      // as passed back from topic map in locationChangedHandler in TopicMapComponent
      const latitude = topicMapChangePayload.lat as Degrees;
      const longitude = topicMapChangePayload.lng as Degrees;
      const zoom = topicMapChangePayload.zoom as Zoom256;

      if (!isMode2d) return;
      if (navMoveInProgressRef.current) {
        console.debug(
          "[Routing][hash] (2D) suppress push: popstate navigation in progress",
          {
            latitude,
            longitude,
            zoom,
            label: labels?.topicMapLocation ?? "Map:2D:location",
          }
        );
        return;
      }
      // If we just restored to a target via popstate, allow small drift without pushing
      const target = popstateTargetRef.current;
      if (target) {
        const eq = isMapCenterZoomEquivalent(
          {
            center: { latitude, longitude },
            zoom,
          },
          {
            center: {
              latitude: target.latitude as Degrees,
              longitude: target.longitude as Degrees,
            },
            zoom: target.zoom,
          },
          { pixelTolerance }
        );
        if (eq) {
          console.debug(
            "[Routing][hash] (2D) skip push: equals popstate target within tolerance",
            { latitude, longitude, zoom, target }
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
              center: { latitude, longitude },
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
              { latitude, longitude, zoom, hLat, hLng, hZoom }
            );
            return;
          }
        }
      } catch {}
      updateHash(
        { lat: latitude, lng: longitude, zoom },
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
        replace: true, // don't push to history until cesium handled history navigation
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
      const view = getLatLngZoom?.();
      if (view) {
        updateHash(
          { lat: view.latitude, lng: view.longitude, zoom: view.zoom },
          { label: labels?.write2d ?? "Map:2D:writeLocation" }
        );
      }
    }
    prevIsMode2dRef.current = isMode2d;
  }, [
    isMode2d,
    updateHash,
    getLatLngZoom,
    setView,
    mapOnce,
    cesiumClearKeys,
    labels?.clear3d,
    labels?.write2d,
  ]);

  // Back/forward navigation: move the 2D map to the historical location without writing a new hash
  useEffect(() => {
    const unSubscribe = subscribe(
      (e) => {
        if (e.source !== "popstate") return;
        if (!isMode2d) return;
        const latitude = e.values.lat as Degrees | undefined;
        const longitude = e.values.lng as Degrees | undefined;
        const zoom = e.values.zoom as Zoom256 | undefined;
        if (latitude == null || longitude == null || !isZoom(zoom)) return;

        navMoveInProgressRef.current = true;
        popstateTargetRef.current = { latitude, longitude, zoom };
        console.debug("[Routing][hash] popstate begin -> restore 2D view", {
          latitude,
          longitude,
          zoom,
        });
        const scheduleClear = (evt: string) => {
          mapOnce?.(evt, () => {
            setTimeout(() => {
              navMoveInProgressRef.current = false;
              console.debug(
                "[Routing][hash] popstate end -> resume 2D writes",
                { via: evt }
              );
            }, 0);
          });
        };
        scheduleClear("moveend");
        scheduleClear("zoomend");
        setView?.({ latitude, longitude, zoom });
      },
      { keys: ["lat", "lng", "zoom"] }
    );
    return unSubscribe;
  }, [subscribe, isMode2d, mapOnce, setView]);

  return { handleTopicMapLocationChange, handleCesiumSceneChange };
}

export function createLocationChangeHandler({
  isMode2d,
  onChange,
  onAfter,
  onMismatch,
}: {
  isMode2d: boolean;
  onChange: (p: unknown) => void;
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
