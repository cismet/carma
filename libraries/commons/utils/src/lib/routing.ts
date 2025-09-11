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

  const combinedSearchParams = new URLSearchParams();
  const sortedAllPairs = sortArrayByKeys(
    Object.entries(combinedParams),
    keyOrder
  );
  sortedAllPairs.forEach(([key, value]) => {
    typeof value === "string" &&
      value.length > 0 &&
      combinedSearchParams.append(key, value); // append preserves insertion order
  });

  const combinedHash = combinedSearchParams.toString();
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
    // not navigable just updates the current hash
    window.location.replace(newUrl);
    debug &&
      console.debug(
        `[Routing][window.location] (${label}): Hash Replace`,
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
