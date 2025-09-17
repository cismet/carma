import * as CesiumNs from "cesium";

/**
 * Return the Cesium runtime version if available; otherwise "unknown".
 * We avoid a named import for VERSION because some type bundles may not expose it.
 */
export function getCesiumVersion(): string {
  return (CesiumNs as unknown as { VERSION?: string }).VERSION || "unknown";
}

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
 */
export function assertWindowCesiumEnv(): void {
  const { cesiumBaseUrl } = checkWindowEnv();
  if (!cesiumBaseUrl) {
    throw new Error(
      "window.CESIUM_BASE_URL is undefined, use setupCesiumEnvironment in app root"
    );
  }
}
