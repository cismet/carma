/**
 * @deprecated Legacy react-cismap RoutedMap bounding box format.
 *
 * Non-standard format with confusing naming (`top` = maxY/north, `bottom` = minY/south).
 *
 * **Migrate to:** Turf's `BBox2d` format: `[minX, minY, maxX, maxY]`
 *
 * See `libraries/geo/README-bbox-formats.md` for format documentation.
 * See issue #435 for migration plan.
 */
export type RoutedMapBoundingBox = {
  /** minX (west) in projected coordinates */
  left: number;
  /** maxY (north) in projected coordinates */
  top: number;
  /** maxX (east) in projected coordinates */
  right: number;
  /** minY (south) in projected coordinates */
  bottom: number;
};

/**
 * Converts react-cismap RoutedMapBoundingBox to standard Turf BBox2d format.
 *
 * @param bbox - RoutedMap bounding box with left/top/right/bottom
 * @returns Standard Turf bbox: [minX, minY, maxX, maxY]
 */
export function routedMapBBoxToTurfBBox(
  bbox: RoutedMapBoundingBox
): [number, number, number, number] {
  return [bbox.left, bbox.bottom, bbox.right, bbox.top];
}

/**
 * Converts standard Turf BBox2d to react-cismap RoutedMapBoundingBox format.
 *
 * @param bbox - Standard Turf bbox: [minX, minY, maxX, maxY]
 * @returns RoutedMap bounding box with left/top/right/bottom
 */
export function turfBBoxToRoutedMapBBox(
  bbox: [number, number, number, number]
): RoutedMapBoundingBox {
  return {
    left: bbox[0],
    bottom: bbox[1],
    right: bbox[2],
    top: bbox[3],
  };
}

// =============================================================================
// ⚠️ DEPRECATED LEGACY FUNCTIONS - DO NOT USE IN NEW CODE
// =============================================================================
// These functions exist ONLY for react-cismap RoutedMap backwards compatibility.
// Moved from @carma-mapping/engines/leaflet to break circular dependency.
//
// ❌ PROBLEMS WITH THIS OLD APPROACH:
// 1. Uses non-standard RoutedMapBoundingBox format (confusing top/bottom naming)
// 2. Weak typing (any types in old code, ManagedProjection instead of specific CRS)
// 3. Returns custom object format instead of industry-standard arrays
// 4. Creates circular dependencies between packages
//
// ✅ NEW CODE SHOULD USE:
// - Standard Turf BBox2d format: [minX, minY, maxX, maxY]
// - Proper Leaflet types: LatLngBounds, LatLngBoundsLiteral
// - Conversion helpers: routedMapBBoxToTurfBBox() / turfBBoxToRoutedMapBBox()
//
// 📦 See: libraries/geo/README-bbox-formats.md for migration guide
// 🎯 Issue #435 tracks full migration plan
// =============================================================================

import type { Map as LeafletMap } from "leaflet";
import * as L from "leaflet";
import { ManagedProjection, getFromWGS84Converter } from "@carma/geo/proj";

/**
 * Inline helper to convert Leaflet LatLng to [lng, lat] array.
 * Inlined here to avoid circular dependency with @carma-mapping/engines/leaflet.
 */
function latLngToLngLatArray(latLng: L.LatLng): [number, number] {
  return [latLng.lng, latLng.lat];
}

/**
 * @deprecated **LEGACY FUNCTION - DO NOT USE IN NEW CODE**
 *
 * This demonstrates the problems with old RoutedMapBoundingBox typing:
 * - Returns custom object format instead of standard Turf BBox2d
 * - Confusing property names (top = maxY/north, bottom = minY/south)
 * - No type safety for coordinate reference systems
 *
 * **For new code, use:**
 * ```typescript
 * import bbox from '@turf/bbox';
 * import { convertTurfBBoxToLeafletBounds } from '@carma-mapping/engines/leaflet';
 *
 * // Get standard Turf BBox2d format
 * const turfBBox = bbox(feature); // [minX, minY, maxX, maxY]
 * const leafletBounds = convertTurfBBoxToLeafletBounds(turfBBox);
 * map.fitBounds(leafletBounds);
 * ```
 *
 * This function exists ONLY for react-cismap RoutedMap backwards compatibility.
 */
export const latLngBoundsToProjectedBBox = (
  bounds: L.LatLngBounds,
  targetProjection: ManagedProjection
): RoutedMapBoundingBox => {
  const northEast = latLngToLngLatArray(bounds.getNorthEast()) as [
    number,
    number
  ];
  const southWest = latLngToLngLatArray(bounds.getSouthWest()) as [
    number,
    number
  ];
  // LatLngBounds is by definition WGS84
  const c = getFromWGS84Converter(targetProjection);
  const projectedNE = c.forward(northEast as any);
  const projectedSW = c.forward(southWest as any);
  return {
    left: projectedSW[0],
    top: projectedNE[1],
    right: projectedNE[0],
    bottom: projectedSW[1],
  };
};

/**
 * @deprecated **LEGACY FUNCTION - DO NOT USE IN NEW CODE**
 *
 * This demonstrates poor typing from old react-cismap code:
 * - Accepts `any` type for leafletMap parameter (no type safety)
 * - Returns non-standard RoutedMapBoundingBox format
 * - Couples map instance to projection conversion (poor separation)
 *
 * **For new code, use:**
 * ```typescript
 * import type { Map as LeafletMap } from 'leaflet';
 * import { convertTurfBBoxToLeafletBounds } from '@carma-mapping/engines/leaflet';
 *
 * const bounds = map.getBounds();
 * // Work with standard LatLngBounds or convert to Turf BBox2d
 * ```
 *
 * This function exists ONLY for react-cismap RoutedMap backwards compatibility.
 */
export function getBoundingBoxForLeafletMap(
  leafletMap: LeafletMap,
  targetProjection: ManagedProjection
): RoutedMapBoundingBox {
  const bounds = leafletMap.getBounds() as L.LatLngBounds;
  const bbox = latLngBoundsToProjectedBBox(bounds, targetProjection);
  return bbox;
}
