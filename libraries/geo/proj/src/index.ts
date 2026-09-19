export * from "./lib/proj4";
export * from "./lib/managed-projections";
export * from "./lib/defs";
export * from "./lib/utils";

export {
  getWebMercatorFromWgs84Deg,
  getWgs84DegFromWebMercator,
} from "./lib/web-mercator";
export {
  WGS84_A,
  WGS84_B,
  WGS84_E2,
  cartographicToEcef,
  projectEllipsoidHorizon,
  ecefToCartographic,
  ecefToEnuMatrix,
  ecefToEnuOffset,
  enuOffsetToEcef,
} from "./lib/geodetic";
export type { CartographicRad } from "./lib/geodetic";
export {
  clampLatitudeToWebMercatorExtent,
  getMercatorScaleFactorAtLatitudeDeg,
  getMercatorScaleFactorAtLatitudeRad,
  getPixelResolutionFromZoomAtLatitudeRad,
  getZoomFromPixelResolutionAtLatitudeRad,
} from "./lib/mercator";
export { getCameraLocalMercatorFit } from "./lib/camera-local-mercator-fit";
export { EARTH_CIRCUMFERENCE, EARTH_RADIUS } from "./lib/earth";
export {
  DEFAULT_LEAFLET_TILESIZE,
  DEFAULT_MERCATOR_LATITUDE_DEG,
  DEFAULT_MERCATOR_LATITUDE_RAD,
  DEFAULT_PIXEL_TOLERANCE,
  DEFAULT_ZOOM_LEVEL,
  WEB_MERCATOR_MAX_LATITUDE_DEG,
  WEB_MERCATOR_MAX_LATITUDE_RAD,
} from "./lib/web-map";

export {
  InvalidVerticalOffsetTileError,
  UnsupportedVerticalOffsetRegionError,
  VerticalOffsetTileLoadError,
} from "./lib/tiled-vertical-offset";
export {
  GCG2016_INTERPOLATION_METHOD,
  GCG2016_SOFTWARE_BOUND_METERS,
  GCG2016_PROVENANCE,
  GCG2016_VALIDATION_METRICS,
  getGcg2016HeightAnomaly,
  getGcg2016HeightAnomalies,
  prefetchGcg2016Tiles,
  queryGcg2016HeightAnomaly,
  queryGcg2016HeightAnomalies,
} from "./lib/gcg2016";
export type { Gcg2016HeightAnomalyQueryResult } from "./lib/gcg2016";
export {
  GCG2016_UTM_ZONES,
  dhhn2016ToEllipsoidalHeight,
  dhhn2016ToEllipsoidalHeights,
  ellipsoidalToDhhn2016Height,
  ellipsoidalToDhhn2016Heights,
  getGcg2016EcefTransformer,
  getGcg2016HeightAnomalyFromUtm,
  getGcg2016UtmVerticalTransformer,
  getGcg2016Wgs84VerticalTransformer,
} from "./lib/gcg2016-transformers";
export type {
  Gcg2016EcefTransformer,
  Gcg2016UtmVerticalTransformer,
  Gcg2016UtmZone,
  Gcg2016Wgs84VerticalTransformer,
} from "./lib/gcg2016-transformers";
export { GRS80_ELLIPSOID, WGS84_ELLIPSOID } from "./lib/ellipsoids";
export type { ReferenceEllipsoid } from "./lib/ellipsoids";
export { utmToEllipsoidSurface } from "./lib/utm-ellipsoid";
export type {
  EllipsoidSurfaceCoordinate,
  UtmReference,
} from "./lib/utm-ellipsoid";
