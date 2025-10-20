export { getCesiumVersion, VERSION } from "@carma/cesium";

/**
 * Check whether required Cesium window environment variables are present.
 * Does not throw; returns the discovered values when available.
 */
export function checkWindowEnv(): {
  cesiumBaseUrl?: string;
} {
  if (typeof window === "undefined") {
    return {};
  }
  const cesiumBaseUrl = (window as unknown as { CESIUM_BASE_URL?: string })
    .CESIUM_BASE_URL;
  return { cesiumBaseUrl };
}

/**
 * Assert that required Cesium window environment variables are configured.
 * Throws with guidance when not configured.
 *
 * NOTE: CesiumContextProvider now auto-calls setupCesiumEnvironment(),
 * so this error should rarely occur unless useCesiumContext is called
 * outside the provider.
 */
export function assertWindowCesiumEnv(): void {
  const { cesiumBaseUrl } = checkWindowEnv();
  if (!cesiumBaseUrl) {
    throw new Error(
      "window.CESIUM_BASE_URL is undefined. " +
        "Ensure you're using CesiumContextProvider with a valid config, " +
        "or call setupCesiumEnvironment() manually. " +
        "See: https://github.com/your-repo/docs/cesium-setup.md"
    );
  }
}
