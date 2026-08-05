import { useMemo } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

const LEAFLET_TO_MAPLIBRE_ZOOM_OFFSET = 1;

type LeafletLikeCenter = { lat: number; lng: number };

export type MaplibreTransitionShim = {
  options: { zoomSnap: number | undefined };
  getCenter: () => LeafletLikeCenter;
  getZoom: () => number;
  setView: (
    center: LeafletLikeCenter,
    zoom: number,
    options?: { animate?: boolean }
  ) => void;
  flyTo: (
    center: LeafletLikeCenter,
    zoom: number,
    options?: { duration?: number; animate?: boolean }
  ) => void;
  stop: () => void;
  once: (type: string, handler: () => void) => void;
  off: (type: string, handler: () => void) => void;
};

export const useMaplibreTransitionShim = (
  map: MaplibreMap | null | undefined
): MaplibreTransitionShim | null =>
  useMemo(() => {
    if (!map) {
      return null;
    }

    const toMaplibreZoom = (leafletZoom: number) =>
      leafletZoom - LEAFLET_TO_MAPLIBRE_ZOOM_OFFSET;

    return {
      // MapLibre has fractional zoom, so there is nothing to snap to.
      // applyZoomSnapToView skips the adjustment on a falsy value.
      options: { zoomSnap: undefined },

      getCenter: () => {
        const center = map.getCenter();
        return { lat: center.lat, lng: center.lng };
      },

      getZoom: () => map.getZoom() + LEAFLET_TO_MAPLIBRE_ZOOM_OFFSET,

      setView: (center, zoom) => {
        console.debug("[LIBRE-TRANSITION-SPIKE] setView", { center, zoom });
        map.jumpTo({
          center: [center.lng, center.lat],
          zoom: toMaplibreZoom(zoom),
        });
      },

      flyTo: (center, zoom, options) => {
        const durationSeconds = options?.duration ?? 0;
        const animate = options?.animate !== false && durationSeconds > 0;
        console.debug("[LIBRE-TRANSITION-SPIKE] flyTo", { center, zoom });
        map.flyTo({
          center: [center.lng, center.lat],
          zoom: toMaplibreZoom(zoom),
          duration: animate ? durationSeconds * 1000 : 0,
          essential: true,
        });
      },

      stop: () => {
        map.stop();
      },

      once: (type, handler) => {
        map.once(type as never, handler);
      },

      off: (type, handler) => {
        map.off(type as never, handler);
      },
    };
  }, [map]);

export default useMaplibreTransitionShim;
