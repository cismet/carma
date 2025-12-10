// namespaced exports
// prefer use namespace when importing to keep import statements clean
// {react} @carma-commons/utils/

export * from "./lib";

export { useMemoMergedDefaultOptions } from "./lib/react/hooks/useMemoMergedDefaultOptions";

export { isNumberArrayEqual } from "./lib/arrays";

export { extractCarmaConfig } from "./lib/carmaConfig";

export { logOnce, warnOnce } from "./lib/console";

export { updateUrl } from "./lib/changeImageEndpoints";

export {
  md5FetchText,
  md5ActionFetchDAQ,
  md5FetchJSON,
} from "./lib/fetching/fetching.ts";

export {
  getGazData,
  type GazDataItem,
  type GazDataConfig,
  type GazDataSourceConfig,
} from "./lib/gazData";

export { extractInformation } from "./lib/layer-parser";

export { suppressReactCismapErrors } from "./lib/log-react-cismap-errors";

export { normalizeOptions } from "./lib/normalizeOptions";

export { clampToToleranceRange, clamp, isClose } from "./lib/numbers";

export { preventPinchZoom } from "./lib/prevent-pinch-zoom.ts";

export * from "./lib/promise";

export {
  PROJ4_CONVERTERS,
  isProj4Converter,
  convertBBox2Bounds,
} from "./lib/proj4helpers";

export { isHtmlString } from "./lib/regex";

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

export { getApplicationVersion } from "./lib/version";

export type { VersionData } from "./lib/version";

export { detectWebGLContext } from "./lib/webgl";

export * from "./lib/window";
