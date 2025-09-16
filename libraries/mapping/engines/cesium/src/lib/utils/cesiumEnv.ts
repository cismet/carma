import * as CesiumNs from "cesium";

/**
 * Return the Cesium runtime version if available; otherwise "unknown".
 * We avoid a named import for VERSION because some type bundles may not expose it.
 */
export function getCesiumVersion(): string {
  return (CesiumNs as unknown as { VERSION?: string }).VERSION || "unknown";
}
