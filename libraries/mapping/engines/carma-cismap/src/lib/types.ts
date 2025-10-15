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
