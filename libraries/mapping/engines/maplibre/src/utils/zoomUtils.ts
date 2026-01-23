/**
 * Zoom utilities for converting between MapLibre GL (512px tiles) and Leaflet (256px tiles) zoom levels
 */

/**
 * Convert MapLibre GL zoom (512px tiles) to Leaflet-like zoom (256px tiles)
 * MapLibre uses 512px tiles which results in zoom being 1 level lower than Leaflet's 256px tiles
 */
export const zoom512as256 = (zoom512: number): number => {
  return zoom512 + 1;
};

/**
 * Convert Leaflet-like zoom (256px tiles) to MapLibre GL zoom (512px tiles)
 */
export const zoom256as512 = (zoom256: number): number => {
  return zoom256 - 1;
};
