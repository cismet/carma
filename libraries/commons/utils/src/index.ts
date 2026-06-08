// namespaced exports
// prefer use namespace when importing to keep import statements clean
// {react} @carma-commons/utils/

import * as Colors from "./lib/colors";

export { Colors };

export {
  COLORS,
  COLORS_HEX,
  DISPLAY_P3_COLORS,
  UNIT_ALPHA,
  formatDisplayP3Css,
  formatHexRgbCss,
  formatHexRgbaCss,
  formatRgb255Css,
  formatRgba255Css,
  hexToRgb255,
  resolveDisplayP3CssColor,
  resolveDisplayP3WhiteCssColor,
  supportsDisplayP3CssColor,
} from "./lib/colors";
export type { DisplayP3, Rgb255, UnitRgba } from "./lib/colors";

export { useMemoMergedDefaultOptions } from "./lib/react/hooks/useMemoMergedDefaultOptions";

export { isLocalhostHostname } from "./lib/hostname";
export {
  Deployment,
  useDeployment,
  useDevDeployment,
  useLiveDeployment,
  type DeploymentTarget,
} from "./lib/react/hooks/useDeployment";

export { isNumberArrayEqual } from "./lib/arrays";

export {
  extractCarmaConfig,
  resolveLayerTitle,
  resolveLayerDescription,
} from "./lib/carmaConfig";

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

export { promiseWithTimeout, waitFrames } from "./lib/promise";

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
  buildHashLaunchModeParams,
  buildOrderedSearchParamsString,
  readHashLaunchMode,
  resolveHashLaunchMode,
  isTruthyHashValue,
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

export { carmaWindow, cjsGlobalShim } from "./lib/window";

export {
  createRingBuffer,
  pushRingBufferEntry,
  readRingBufferEntries,
  clearRingBuffer,
  type RingBuffer,
} from "./lib/collections";
