import { Map as LeafletMap } from "leaflet";
import type { Map as MaplibreMap } from "maplibre-gl";

import type { Zoom256, LatLngZoom, LeafletLikeMap } from "@carma/types";
import { zoom256as512 } from "@carma-mapping/engines/maplibre";

// Re-export for convenience
export type { LatLngZoom, LeafletLikeMap };

/**
 * Extracts the current center coordinates and zoom level from a Leaflet-like map.
 * @throws {Error} If the map doesn't provide valid center or zoom values
 */
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

/**
 * Sets the view (center and zoom) on a Leaflet-like map.
 * Handles coordinate system differences between MapLibre (lng, lat) and Leaflet (lat, lng).
 */
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

/**
 * Triggers a location change event by extracting the current map position
 * and invoking the provided handler. Useful for programmatically syncing map state.
 */
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
