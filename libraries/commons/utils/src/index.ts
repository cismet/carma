export { useMemoMergedDefaultOptions } from "./lib/react/hooks/useMemoMergedDefaultOptions";

export { isNumberArrayEqual } from "./lib/arrays";

export { extractCarmaConfig } from "./lib/carmaConfig";

export * from "./lib/constants";

export { md5FetchText, md5ActionFetchDAQ } from "./lib/fetching";

export {
  getGazData,
  type GazDataItem,
  type GazDataConfig,
  type GazDataSourceConfig,
} from "./lib/gazData";

export {
  metersPerPixel,
  distanceMeters,
  pixelsBetweenLocations,
  isLocationEqualWithinPixelTolerance,
  type LatLng,
  type LatLngZoom,
} from "./lib/geo";

export {
  getMercatorScaleFactorAtLatitudeRad,
  getZoomFromPixelResolutionAtLatitudeRad,
  getPixelResolutionFromZoomAtLatitudeRad,
  clampLatitudeRadiansToWebMercatorExtent,
} from "./lib/mercator";

export { extractInformation } from "./lib/layer-parser";

export { suppressReactCismapErrors } from "./lib/log-react-cismap-errors";

export { normalizeOptions } from "./lib/normalizeOptions";

export { clampToToleranceRange, clamp } from "./lib/numbers";

export { preventPinchZoom } from "./lib/prevent-pinch-zoom.ts";

export {
  PROJ4_CONVERTERS,
  isProj4Converter,
  convertBBox2Bounds,
} from "./lib/proj4helpers";

export {
  updateHashHistoryState,
  getHashParams,
  diffHashParams,
} from "./lib/routing.ts";

export { generateRandomString } from "./lib/strings";

export {
  cn,
  TAILWIND_CLASSNAMES_FULLSCREEN_FIXED,
} from "./lib/styles-tailwind";

export {
  asDegrees,
  asRadians,
  degToRad,
  radToDeg,
  unDeg,
  unRad,
  asMeters,
  unMeters,
  // type guards
  isDegrees,
  isRadians,
  isMeters,
} from "./lib/units";

export { getApplicationVersion } from "./lib/version";

export { detectWebGLContext } from "./lib/webgl";
