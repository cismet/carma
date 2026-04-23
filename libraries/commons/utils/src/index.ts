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

export { fetchGraphQL } from "./lib/fetching/cids.ts";
export type { FetchGraphQLResult } from "./lib/fetching/cids.ts";

export { extractInformation } from "./lib/layer-parser";

export { suppressReactCismapErrors } from "./lib/log-react-cismap-errors";

export { normalizeOptions } from "./lib/normalizeOptions";

export {
  clampToToleranceRange,
  clamp,
  isClose,
  formatFixedNumber,
} from "./lib/numbers";

export { preventPinchZoom } from "./lib/prevent-pinch-zoom.ts";

export * from "./lib/promise";

export {
  PROJ4_CONVERTERS,
  isProj4Converter,
  convertBBox2Bounds,
} from "./lib/proj4helpers";

export { isHtmlString } from "./lib/regex";

export {
  DEFAULT_HASH_LAUNCH_FLAG_2D_KEY,
  DEFAULT_HASH_LAUNCH_FLAG_3D_KEY,
  DEFAULT_HASH_LAUNCH_LEGACY_FLAG_2D_KEY,
  DEFAULT_HASH_LAUNCH_LEGACY_FLAG_3D_KEY,
  DEFAULT_HASH_LAUNCH_ALTITUDE_KEYS,
  DEFAULT_HASH_LAUNCH_2D_VIEW_KEYS,
  HASH_LAUNCH_MODE,
  readHashLaunchMode,
  resolveHashLaunchMode,
  updateHashHistoryState,
  getHashParams,
  diffHashParams,
} from "./lib/routing.ts";
export type { HashLaunchMode, HashLaunchModeConfig } from "./lib/routing.ts";

export {
  generateRandomString,
  capitalizeFirstLetter,
  trimLines,
} from "./lib/strings";

export {
  cn,
  TAILWIND_CLASSNAMES_FULLSCREEN_FIXED,
} from "./lib/styles-tailwind";

export { getApplicationVersion } from "./lib/version";

export type { VersionData } from "./lib/version";

export { detectWebGLContext } from "./lib/webgl";

// Legacy convenience re-exports. New code should prefer @carma-commons/dom/window.
export { carmaWindow, handleDelayedRender, cjsGlobalShim } from "./lib/window";

export {
  createRingBuffer,
  pushRingBufferEntry,
  readRingBufferEntries,
  clearRingBuffer,
  type RingBuffer,
} from "./lib/collections";
