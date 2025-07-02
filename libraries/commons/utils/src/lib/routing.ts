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
 * Updates the URL hash parameters without triggering a React Router navigation
 */
export const updateHashHistoryState = (
  hashParams: Record<string, string> = {},
  routedPath: string,
  options: { removeKeys?: string[]; label?: string; keyOrder?: string[] } = {}
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
  const fullHashState = `#${routedPath}?${combinedHash}`;
  // this is a workaround to avoid triggering rerenders from the HashRouter
  // navigate would cause rerenders
  // navigate(`${routedPath}?${formattedHash}`, { replace: true });
  // see https://github.com/remix-run/react-router/discussions/9851#discussioncomment-9459061

  const currentUrl = new URL(window.location.href);
  const newUrl = `${currentUrl.origin}${currentUrl.pathname}${fullHashState}`;

  window.history.replaceState(null, "", newUrl);
  console.debug(`[Routing][window.history] (${label}): State Replace`, newUrl);
};
