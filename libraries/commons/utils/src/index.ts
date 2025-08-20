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
  pixelsBetweenGeographicLocations,
  isLocationEqualWithinPixelTolerance,
} from "./lib/geo";

export {
  getMercatorScaleFactorAtLatitudeRad,
  getZoomFromPixelResolutionAtLatitudeRad,
  getPixelResolutionFromZoomAtLatitudeRad,
  clampLatitudeToWebMercatorExtent,
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
  brandedNegate,
  brandedAdd,
  brandedSub,
  brandedMul,
  brandedDiv,
  brandedAbs,
  brandedMin,
  brandedMax,
  brandedClamp,
  unbrandNumber,
} from "./lib/typescript-branded-ops";

export {
  asDegrees,
  asRadians,
  degToRad,
  radToDeg,
  asMeters,
} from "./lib/units";

export { getApplicationVersion } from "./lib/version";

export { detectWebGLContext } from "./lib/webgl";
