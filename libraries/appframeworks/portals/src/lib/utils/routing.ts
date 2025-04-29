type EncodedSceneParams = {
  hashParams: Record<string, string>;
  state?: unknown;
};

// Using a singleton pattern to store the current hash parameters
// We use a WeakMap with window as key to ensure it's garbage collected if needed
const currentHashParamsStore: WeakMap<
  Window,
  Record<string, string>
> = new WeakMap();

/**
 * Get the stored parameters or parse them from the URL as fallback
 */
export const getHashParams = (
  hash = window.location.hash.split("?")[1] || ""
): Record<string, string> => {
  try {
    // Check if we have stored parameters first
    if (currentHashParamsStore.has(window)) {
      return { ...currentHashParamsStore.get(window) };
    }

    // Fallback to parsing from URL
    return Object.fromEntries(new URLSearchParams(hash));
  } catch (error) {
    console.debug("Error parsing hash parameters:", error);
    return {};
  }
};

/**
 * Updates the URL hash parameters without triggering a React Router navigation
 */
export const replaceHashRoutedHistory = (
  hashParams: Record<string, string> = {},
  routedPath: string,
  removeKeys: string[] = [],
  label: string = "N/A" // for tracing debugging only
) => {
  // this is method is used to avoid triggering rerenders from the HashRouter when updating the hash
  const currentParams = getHashParams();

  const combinedParams: Record<string, string> = {
    ...currentParams,
    ...hashParams, // overwrite from state but keep others
  };

  // remove keys that are in the removeKeys array
  removeKeys.forEach((key) => {
    if (key in combinedParams) {
      delete combinedParams[key];
    }
  });

  // Store the combined parameters in our WeakMap
  currentHashParamsStore.set(window, { ...combinedParams });

  const combinedSearchParams = new URLSearchParams(combinedParams);
  const combinedHash = combinedSearchParams.toString();
  const fullHashState = `#${routedPath}?${combinedHash}`;
  // this is a workaround to avoid triggering rerenders from the HashRouter
  // navigate would cause rerenders
  // navigate(`${routedPath}?${formattedHash}`, { replace: true });
  // see https://github.com/remix-run/react-router/discussions/9851#discussioncomment-9459061

  const currentUrl = new URL(window.location.href);
  const newUrl = `${currentUrl.origin}${currentUrl.pathname}${fullHashState}`;

  window.history.replaceState(null, "", newUrl);
  console.debug(
    `[Routing] Hash parameters updated (${label}):`,
    combinedParams
  );
};

/**
 * Synchronizes the internal parameter store with the current URL
 * Call this when you know the URL has been changed externally (e.g., by user navigation)
 */
export const syncParamsWithUrl = (): void => {
  const urlParams = Object.fromEntries(
    new URLSearchParams(window.location.hash.split("?")[1] || "")
  );
  currentHashParamsStore.set(window, urlParams);
  console.debug("[Routing] Parameters synced from URL:", urlParams);
};

/**
 * Clears the stored parameters, forcing fallback to URL parsing
 */
export const clearStoredParams = (): void => {
  if (currentHashParamsStore.has(window)) {
    currentHashParamsStore.delete(window);
    console.debug("[Routing] Cleared stored parameters");
  }
};
