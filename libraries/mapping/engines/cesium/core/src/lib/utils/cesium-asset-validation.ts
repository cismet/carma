/**
 * Validates that Cesium runtime assets (Workers, Assets, etc.) are available
 * @param baseUrl The base URL where Cesium assets should be located (e.g., "/cesium" or "/__cesium__")
 * @returns Promise that resolves to true if workers are available, false otherwise
 */
export async function validateCesiumWorkers(
  baseUrl: string = "/cesium"
): Promise<{ available: boolean; error?: string }> {
  try {
    // Normalize baseUrl - remove trailing slash
    const normalizedBaseUrl = baseUrl.endsWith("/")
      ? baseUrl.slice(0, -1)
      : baseUrl;

    // Check for Cesium.js - the main Cesium library file that must exist
    const cesiumLibUrl = `${normalizedBaseUrl}/Cesium.js`;

    const response = await fetch(cesiumLibUrl, {
      method: "HEAD",
      cache: "no-cache",
    });

    if (!response.ok) {
      return {
        available: false,
        error: `Cesium assets not found at ${cesiumLibUrl} (${response.status} ${response.statusText})`,
      };
    }

    return { available: true };
  } catch (error) {
    return {
      available: false,
      error: `Failed to validate Cesium assets: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Synchronously checks if the baseUrl is configured
 * This is a quick pre-check before attempting async validation
 */
export function isCesiumBaseUrlConfigured(baseUrl?: string): boolean {
  return Boolean(baseUrl && baseUrl.trim().length > 0);
}
