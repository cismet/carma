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

// A lightweight type for a React Router-like navigate function.
// We avoid importing react-router here to keep this utility framework-agnostic.
type NavigateLike = (
  to: string,
  opts?: { replace?: boolean; state?: unknown }
) => void;

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
export const updateHashHistoryState = (
  hashParams: Record<string, string> = {},
  routedPath: string,
  options: {
    removeKeys?: string[];
    label?: string;
    keyOrder?: string[];
    replace?: boolean; // if true: replace current entry; default false => push
    navigate?: NavigateLike; // optional router navigate function
  } = {}
) => {
  // this is method is used to avoid triggering rerenders from the HashRouter when updating the hash
  const currentParams = getHashParams();

  const combinedParams: Record<string, string> = {
    ...currentParams,
    ...hashParams, // overwrite from state but keep others
  };

  const removeKeys = options.removeKeys || [];
  const label = options.label || "N/A"; // for tracing debugging only
  const keyOrder = options.keyOrder || [];
  const replace = options.replace === true; // default: push

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
  // this is a workaround to avoid triggering rerenders from the HashRouter
  // navigate would cause rerenders
  // navigate(`${routedPath}?${formattedHash}`, { replace: true });
  // see https://github.com/remix-run/react-router/discussions/9851#discussioncomment-9459061

  // Prefer router-aware navigation if provided
  if (options.navigate) {
    options.navigate(toPath, { replace });
    console.debug(
      `[Routing][react-router] (${label}): ${replace ? "Replace" : "Push"}`,
      toPath
    );
    return;
  }

  // Fallback to direct hash manipulation that emits 'hashchange'
  // - Replace: use location.replace(...) to avoid adding history entries
  // - Push: assign to location.hash to add a new history entry
  if (replace) {
    const currentUrl = new URL(window.location.href);
    const newUrl = `${currentUrl.origin}${currentUrl.pathname}${fullHashState}`;
    window.location.replace(newUrl);
    console.debug(
      `[Routing][window.location] (${label}): Hash Replace`,
      newUrl
    );
  } else {
    window.location.hash = toPath;
    console.debug(
      `[Routing][window.location] (${label}): Hash Push`,
      `#${toPath}`
    );
  }
};
