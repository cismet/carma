export {
  distanceFromMercatorZoomAtLatitudeDeg,
  distanceMeters,
  isLocationVisuallyEquivalentAtZoom,
  isMapCenterZoomEquivalent,
  mercatorZoomFromDistanceAtLatitudeDeg,
  metersPerPixel,
  metersPerPixelAtLatitudeRad,
  pixelsBetweenGeographicLocations,
} from "./lib/geo";
export {
  extractRingsFromGeoJson,
  extractRingsFromGeometry,
} from "./lib/geojson-rings";
export type { ExtractRingsFromGeoJsonOptions } from "./lib/geojson-rings";
export type { CartographicRad } from "@carma-geo/proj";
export type { WMSLayerDetails, WMSLayerMap } from "./lib/types/ogc/wms.d";
