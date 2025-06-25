export { useMemoMergedDefaultOptions } from "./lib/react/hooks/useMemoMergedDefaultOptions";

export { isNumberArrayEqual } from "./lib/arrays";

export { extractCarmaConfig } from "./lib/carmaConfig";

export { md5FetchText, md5ActionFetchDAQ } from "./lib/fetching";

export {
  getGazData,
  type GazDataItem,
  type GazDataConfig,
  type GazDataSourceConfig,
} from "./lib/gazData";

export { suppressReactCismapErrors } from "./lib/log-react-cismap-errors";

export { normalizeOptions } from "./lib/normalizeOptions";

export { clampToToleranceRange } from "./lib/numbers";

export {
  PROJ4_CONVERTERS,
  isProj4Converter,
  convertBBox2Bounds,
} from "./lib/proj4helpers";

export { updateHashHistoryState, getHashParams } from "./lib/routing.ts";

export { generateRandomString } from "./lib/strings";

export {
  cn,
  TAILWIND_CLASSNAMES_FULLSCREEN_FIXED,
} from "./lib/styles-tailwind";

export { getApplicationVersion } from "./lib/version";

export { detectWebGLContext } from "./lib/webgl";

export { extractInformation } from "./lib/layer-parser";
