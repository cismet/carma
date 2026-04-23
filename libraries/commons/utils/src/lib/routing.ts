import { normalizeOptions } from "./normalizeOptions";
const sortArrayByKeys = (
  arr: [string, unknown][],
  keyOrder: string[],
  sortRestAlphabetically: boolean = false
) =>
  arr.sort(([keyA], [keyB]) => {
    const indexA = keyOrder.indexOf(keyA);
    const indexB = keyOrder.indexOf(keyB);
    if (indexA !== -1 && indexB !== -1) {
      // Both keys are in our custom order array
      return indexA - indexB;
    } else if (indexA !== -1) {
      // Only keyA is in custom order, so it comes first
      return -1;
    } else if (indexB !== -1) {
      // Only keyB is in custom order, so it comes first
      return 1;
    } else {
      // If neither key is in the custom order, sort optionally alphabetically
      return sortRestAlphabetically ? keyA.localeCompare(keyB) : 0;
    }
  });

export const buildOrderedSearchParamsString = (
  params: Record<string, string | number | boolean | null | undefined>,
  keyOrder: string[] = []
): string => {
  const sortedPairs = sortArrayByKeys(Object.entries(params), keyOrder);
  const encodedParts: string[] = [];

  sortedPairs.forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    const encodedKey = encodeURIComponent(key);
    if (value === "") {
      encodedParts.push(encodedKey);
      return;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      encodedParts.push(`${encodedKey}=${encodeURIComponent(String(value))}`);
    }
  });

  return encodedParts.join("&");
};

export const HASH_LAUNCH_MODE = {
  TWO_D: "2d",
  THREE_D: "3d",
  UNSET: "unset",
} as const;

export type HashLaunchMode =
  (typeof HASH_LAUNCH_MODE)[keyof typeof HASH_LAUNCH_MODE];

type ResolvedHashLaunchMode = Exclude<
  HashLaunchMode,
  typeof HASH_LAUNCH_MODE.UNSET
>;

export const DEFAULT_HASH_LAUNCH_FLAG_2D_KEY = HASH_LAUNCH_MODE.TWO_D;
export const DEFAULT_HASH_LAUNCH_FLAG_3D_KEY = HASH_LAUNCH_MODE.THREE_D;
export const DEFAULT_HASH_LAUNCH_LEGACY_FLAG_2D_KEY = "is2d";
export const DEFAULT_HASH_LAUNCH_LEGACY_FLAG_3D_KEY = "is3d";
export const DEFAULT_HASH_LAUNCH_ALTITUDE_KEYS = ["h", "altitude"] as const;
export const DEFAULT_HASH_LAUNCH_2D_VIEW_KEYS = ["lat", "lng", "zoom"] as const;

export type HashLaunchModeConfig = {
  defaultMode?: ResolvedHashLaunchMode;
  flag2dKey?: string;
  flag3dKey?: string;
};

const resolveLaunchModeConfig = (config: HashLaunchModeConfig = {}) => ({
  defaultMode: config.defaultMode,
  flag2dKey: config.flag2dKey ?? DEFAULT_HASH_LAUNCH_FLAG_2D_KEY,
  flag3dKey: config.flag3dKey ?? DEFAULT_HASH_LAUNCH_FLAG_3D_KEY,
});

export const isTruthyHashValue = (value: unknown): boolean => {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return (
      normalized.length > 0 &&
      normalized !== "0" &&
      normalized !== "false" &&
      normalized !== "off"
    );
  }

  return true;
};

const readFiniteHashNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const hasValid2dViewParams = (params: Record<string, unknown>): boolean =>
  DEFAULT_HASH_LAUNCH_2D_VIEW_KEYS.every(
    (key) => readFiniteHashNumber(params[key]) !== null
  );

export const readHashLaunchMode = (
  hash: Record<string, unknown> | undefined,
  config: HashLaunchModeConfig = {}
): HashLaunchMode => {
  const resolved = resolveLaunchModeConfig(config);
  const params = hash ?? {};

  const hasAltitude = DEFAULT_HASH_LAUNCH_ALTITUDE_KEYS.some(
    (key) => params[key] !== undefined
  );
  if (hasAltitude) {
    return HASH_LAUNCH_MODE.THREE_D;
  }

  if (params[resolved.flag3dKey] !== undefined) {
    return HASH_LAUNCH_MODE.THREE_D;
  }

  if (
    isTruthyHashValue(params[DEFAULT_HASH_LAUNCH_LEGACY_FLAG_3D_KEY])
  ) {
    return HASH_LAUNCH_MODE.THREE_D;
  }

  if (params[resolved.flag2dKey] !== undefined) {
    return HASH_LAUNCH_MODE.TWO_D;
  }

  if (
    isTruthyHashValue(params[DEFAULT_HASH_LAUNCH_LEGACY_FLAG_2D_KEY])
  ) {
    return HASH_LAUNCH_MODE.TWO_D;
  }

  if (hasValid2dViewParams(params)) {
    return HASH_LAUNCH_MODE.TWO_D;
  }

  return HASH_LAUNCH_MODE.UNSET;
};

export const resolveHashLaunchMode = (
  hash: Record<string, unknown> | undefined,
  config: HashLaunchModeConfig = {}
): ResolvedHashLaunchMode => {
  const resolved = resolveLaunchModeConfig(config);
  const mode = readHashLaunchMode(hash, resolved);
  if (mode !== HASH_LAUNCH_MODE.UNSET) {
    return mode;
  }
  return resolved.defaultMode ?? HASH_LAUNCH_MODE.TWO_D;
};

export const buildHashLaunchModeParams = (
  mode: HashLaunchMode,
  config: HashLaunchModeConfig = {}
): Record<string, string | undefined> => {
  const resolved = resolveLaunchModeConfig(config);

  if (mode === HASH_LAUNCH_MODE.THREE_D) {
    return {
      [resolved.flag3dKey]: "",
      [resolved.flag2dKey]: undefined,
    };
  }

  if (mode === HASH_LAUNCH_MODE.TWO_D) {
    return {
      [resolved.flag2dKey]: "",
      [resolved.flag3dKey]: undefined,
    };
  }

  return {
    [resolved.flag2dKey]: undefined,
    [resolved.flag3dKey]: undefined,
  };
};

/**
 * Get the stored parameters or parse them from the URL as fallback
 */
export const getHashParams = (hash?: string): Record<string, string> => {
  const locationHash = hash ?? window.location.hash.split("?")[1] ?? "";

  try {
    return Object.fromEntries(new URLSearchParams(locationHash));
  } catch (error) {
    console.debug("Error parsing hash parameters:", error);
    return {};
  }
};

/**
 * Computes which keys changed and which were removed when going from `before` to `after`.
 * Keys refer to the literal hash parameter names (aliasing not considered here).
 */
export const diffHashParams = (
  before: Record<string, string>,
  after: Record<string, string>
) => {
  const allKeys = new Set<string>([
    ...Object.keys(before),
    ...Object.keys(after),
  ]);
  const changedKeys: string[] = [];
  const removedKeys: string[] = [];
  allKeys.forEach((k) => {
    if (before[k] !== after[k]) changedKeys.push(k);
  });
  Object.keys(before).forEach((k) => {
    if (!(k in after)) removedKeys.push(k);
  });
  return {
    changedKeys: [...new Set(changedKeys)],
    removedKeys: [...new Set(removedKeys)],
  };
};

/**
 * Updates the URL hash parameters without triggering a React Router navigation
 */

interface updateHashHistoryStateOptions {
  removeKeys?: string[];
  label?: string;
  keyOrder?: string[];
  replace?: boolean; // if true: replace current entry; default false => push
  debug?: boolean;
}

const defaultOptions: Required<updateHashHistoryStateOptions> = {
  removeKeys: [],
  label: "N/A",
  keyOrder: [],
  replace: false,
  debug: false,
};

export const updateHashHistoryState = (
  hashParams: Record<string, string> = {},
  routedPath: string,
  options: updateHashHistoryStateOptions
) => {
  // this is method is used to avoid triggering rerenders from the HashRouter when updating the hash
  const currentParams = getHashParams();

  const combinedParams: Record<string, string> = {
    ...currentParams,
    ...hashParams, // overwrite from state but keep others
  };

  const { removeKeys, label, keyOrder, replace, debug } = normalizeOptions(
    options,
    defaultOptions
  );

  // remove keys that are in the removeKeys array
  removeKeys.forEach((key) => {
    if (key in combinedParams) {
      delete combinedParams[key];
    }
  });

  const combinedHash = buildOrderedSearchParamsString(combinedParams, keyOrder);
  const toPath = `${routedPath}${combinedHash ? `?${combinedHash}` : ""}`;
  const fullHashState = `#${toPath}`;
  // No-op: target equals current hash
  if (window.location.hash === fullHashState) {
    console.debug(
      `[Routing] (noop): target hash equals current`,
      fullHashState
    );
    return;
  }
  // Avoid React Router's navigate() to prevent cascade rerenders
  // - navigate() triggers React Router rerenders and component cascades
  // navigate(`${routedPath}?${formattedHash}`, { replace: true });
  // see https://github.com/remix-run/react-router/discussions/9851#discussioncomment-9459061

  // History API that doesn't emit 'hashchange' events (prevents React Router rerenders)
  // Use History API to update URL without triggering hashchange events
  const currentUrl = new URL(window.location.href);
  const newUrl = `${currentUrl.origin}${currentUrl.pathname}${fullHashState}`;

  if (replace) {
    // replaces current location without adding a new browser history entry
    window.location.replace(newUrl);
    debug &&
      console.debug(
        `[Routing][window.location.replace] (${label}): Hash Replace`,
        `#${toPath}`
      );
  } else {
    // navigable Push: assign to location.hash to add a new history entry
    window.history.pushState({}, "", newUrl);
    debug &&
      console.debug(
        `[Routing][window.location] (${label}): Hash Push`,
        `#${toPath}`
      );
  }
};
