import type { Map as LeafletMap } from "leaflet";
import type { BBox2d } from "@turf/helpers";
import {
  ManagedProjection,
  ManagedProjections,
  getFromWGS84Converter,
  getProj4Converter,
} from "@carma/geo/proj";
import type { RoutedMapBoundingBox } from "@carma-mapping/engines/carma-cismap";
import { latLngToTypedLngLatArr } from "./latLng";
import * as L from "leaflet";

/**
 * Type for Leaflet-compatible bounds: [[south, west], [north, east]]
 * or [[lat_sw, lng_sw], [lat_ne, lng_ne]]
 *
 * This is the format that Leaflet's `fitBounds()` accepts.
 */
export type LeafletBoundsArray = [[number, number], [number, number]];
/**
 * @deprecated Use standard Turf BBox2d format instead of RoutedMapBoundingBox.
 * This function exists for react-cismap RoutedMap compatibility only.
 */
export const latLngBoundsToProjectedBBox = (
  bounds: L.LatLngBounds,
  targetProjection: ManagedProjection
): RoutedMapBoundingBox => {
  const northEast = latLngToTypedLngLatArr(bounds.getNorthEast());
  const southWest = latLngToTypedLngLatArr(bounds.getSouthWest());
  // LatLngBounds is by definition WGS84
  const c = getFromWGS84Converter(targetProjection);
  const projectedNE = c.forward(northEast);
  const projectedSW = c.forward(southWest);
  return {
    left: projectedSW[0],
    top: projectedNE[1],
    right: projectedNE[0],
    bottom: projectedSW[1],
  };
};

/**
 * @deprecated Use standard Turf BBox2d format instead of RoutedMapBoundingBox.
 * This function exists for react-cismap RoutedMap compatibility only.
 */
export function getBoundingBoxForLeafletMap(
  leafletMap: LeafletMap,
  targetProjection: ManagedProjection
): RoutedMapBoundingBox {
  const bounds = leafletMap.getBounds() as L.LatLngBounds;
  const bbox = latLngBoundsToProjectedBBox(bounds, targetProjection);
  return bbox;
}

/**
 * Converts a Turf bbox array to Leaflet bounds array in WGS84.
 *
 * @param bbox - Turf bbox format: [minX, minY, maxX, maxY] in source projection
 * @param sourceProjection - Source projection (default: EPSG:3857 Web Mercator)
 * @returns Leaflet bounds format: [[south, west], [north, east]] in WGS84
 *
 * @example
 * ```ts
 * import bbox from '@turf/bbox';
 * const turfBbox = bbox(feature); // BBox2d in EPSG:3857
 * const leafletBounds = convertTurfBBoxToLeafletBounds(turfBbox);
 * map.fitBounds(leafletBounds);
 * ```
 */
export function convertTurfBBoxToLeafletBounds(
  bbox: BBox2d,
  sourceProjection: ManagedProjection = ManagedProjections.EPSG3857
): LeafletBoundsArray {
  const converter = getProj4Converter(
    sourceProjection,
    ManagedProjections.EPSG4326
  );

  // Turf bbox: [minX, minY, maxX, maxY] = [west, south, east, north] in source CRS
  const sw = converter.forward([bbox[0], bbox[1]]); // [lng_sw, lat_sw]
  const ne = converter.forward([bbox[2], bbox[3]]); // [lng_ne, lat_ne]

  // Leaflet bounds: [[lat_south, lng_west], [lat_north, lng_east]]
  return [
    [sw[1], sw[0]],
    [ne[1], ne[0]],
  ];
}
