import { CesiumConfig } from "../../../../../mapping/engines/cesium/types/src/index.ts";
import { MapStyleKey } from "../constants";
/**
 * Validates that the Cesium configuration has all required styles for the app's mapping.
 * This ensures that every portal map style (e.g., "karte", "luftbild") can be mapped
 * to a corresponding Cesium scene style that exists in the config.
 *
 * Validation runs once during PortalProvider initialization.
 *
 * @param cesiumConfig - The Cesium configuration to validate
 * @param mapStyleMapping - App-specific mapping from portal styles to Cesium styles
 * @throws {Error} If config is invalid or missing required styles
 */
export declare function validatePortalCesiumConfig(
  cesiumConfig: CesiumConfig | undefined,
  mapStyleMapping: Record<MapStyleKey, string>
): void;
