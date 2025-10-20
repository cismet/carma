import * as CesiumNs from "cesium";

/**
 * Return the Cesium runtime version if available; otherwise "unknown".
 * We avoid a named import for VERSION because TypeScript definitions don't expose it.
 *
 * @returns Cesium version string or "unknown"
 */
export function getCesiumVersion(): string {
  return (CesiumNs as unknown as { VERSION?: string }).VERSION || "unknown";
}

/**
 * Cesium version constant (lazily evaluated)
 * Use getCesiumVersion() if you need guaranteed runtime access
 */
export const VERSION = getCesiumVersion();
