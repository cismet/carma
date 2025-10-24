import type { CesiumConfig } from "@carma-mapping/engines/cesium/types";
import type { MapStyleKey } from "../constants";

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
export function validatePortalCesiumConfig(
  cesiumConfig: CesiumConfig | undefined,
  mapStyleMapping: Record<MapStyleKey, string>
): void {
  console.log("[PortalProvider] Validating Cesium config", {
    hasCesiumConfig: !!cesiumConfig,
    hasSceneStyle: !!cesiumConfig?.sceneStyle,
    hasStyles: !!cesiumConfig?.sceneStyle?.styles,
  });

  // Check if cesiumConfig exists
  if (!cesiumConfig) {
    const error =
      "[PortalProvider] Config validation failed: cesiumConfig is undefined. PortalConfig must include a cesiumConfig object.";
    console.error(error);
    throw new Error(error);
  }

  // Check if sceneStyle is defined (singular - this is the correct property name)
  if (!cesiumConfig.sceneStyle) {
    const error =
      "[PortalProvider] Config validation failed: cesiumConfig.sceneStyle is undefined. Cesium configuration must include a sceneStyle object with sources and styles.";
    console.error(error);
    throw new Error(error);
  }

  // Check if styles array exists
  if (
    !cesiumConfig.sceneStyle.styles ||
    !Array.isArray(cesiumConfig.sceneStyle.styles)
  ) {
    const error =
      "[PortalProvider] Config validation failed: cesiumConfig.sceneStyle.styles is undefined or not an array. Must define at least one style.";
    console.error(error);
    throw new Error(error);
  }

  const availableCesiumStyles = cesiumConfig.sceneStyle.styles.map((s) => s.id);
  console.log(
    "[PortalProvider] Available Cesium styles:",
    availableCesiumStyles
  );

  if (availableCesiumStyles.length === 0) {
    const error =
      "[PortalProvider] Config validation failed: cesiumConfig.sceneStyle.styles is empty. At least one scene style must be defined.";
    console.error(error);
    throw new Error(error);
  }

  // Validate that all mapped Cesium styles exist in config
  for (const [portalStyle, cesiumStyleId] of Object.entries(mapStyleMapping)) {
    if (!availableCesiumStyles.includes(cesiumStyleId)) {
      const error = `[PortalProvider] Config validation failed: mapStyleToCesiumStyleMapping requires Cesium style '${cesiumStyleId}' for portal style '${portalStyle}', but it's not defined in cesiumConfig.sceneStyle.styles. Available: ${availableCesiumStyles.join(
        ", "
      )}. Add this style to your Cesium config.`;
      console.error(error);
      throw new Error(error);
    }
  }

  console.log("[PortalProvider] ✓ Cesium config validated successfully");
}
