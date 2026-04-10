import { getCesiumVersion } from "@carma-cesium";

export { getCesiumVersion };

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

export function assertWindowCesiumEnv(): void {
  const { cesiumBaseUrl } = checkWindowEnv();
  if (!cesiumBaseUrl) {
    throw new Error(
      "window.CESIUM_BASE_URL is undefined, use setupCesiumEnvironment in app root"
    );
  }
}
