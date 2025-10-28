import type { BBox2d } from "@turf/helpers";
import {
  ManagedProjection,
  ManagedProjections,
  getProj4Converter,
} from "@carma/geo/proj";
import * as L from "leaflet";

/**
 * Type for Leaflet-compatible bounds: [[south, west], [north, east]]
 * or [[lat_sw, lng_sw], [lat_ne, lng_ne]]
 *
 * This is the format that Leaflet's `fitBounds()` accepts.
 */
export type LeafletBoundsArray = [[number, number], [number, number]];

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
