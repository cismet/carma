import { LatLngZoom, LeafletLikeMap } from "../../../../../types/src/index.ts";
export type { LatLngZoom, LeafletLikeMap };
/**
 * Extracts the current center coordinates and zoom level from a Leaflet-like map.
 * @throws {Error} If the map doesn't provide valid center or zoom values
 */
export declare const getLatLngZoomFromLeafletLike: (
  map: LeafletLikeMap
) => LatLngZoom;
/**
 * Sets the view (center and zoom) on a Leaflet-like map.
 * Handles coordinate system differences between MapLibre (lng, lat) and Leaflet (lat, lng).
 */
export declare const setViewLeafletLike: (
  map: LeafletLikeMap,
  { lat, lng, zoom }: LatLngZoom
) => void;
/**
 * Triggers a location change event by extracting the current map position
 * and invoking the provided handler. Useful for programmatically syncing map state.
 */
export declare const triggerLeafletLikeLocationChangeEvent: (
  map: LeafletLikeMap | null | undefined,
  handler: (latLngZoom: LatLngZoom) => void
) => void;
