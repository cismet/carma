import type { CesiumConfig } from "@carma/cesium/types";

/**
 * Validates that a scene style exists in the Cesium configuration.
 * Throws descriptive errors if validation fails.
 *
 * @param style - The style ID to validate
 * @param config - The Cesium configuration containing scene style with styles array
 * @throws {Error} If style is not provided, no styles exist, or requested style not found
 */
export function validateSceneStyle(style: string, config: CesiumConfig): void {
  // 1. Validate style ID provided
  if (!style) {
    const error = "[CesiumContext] prepareSceneInit: No style ID provided";
    console.error(error);
    throw new Error(error);
  }

  // 2. Validate config has sceneStyle defined
  if (!config.sceneStyle) {
    const error =
      "[CesiumContext] prepareSceneInit: config.sceneStyle is undefined. Cesium config must have a sceneStyle object.";
    console.error(error);
    throw new Error(error);
  }

  // 3. Validate styles array exists
  if (!config.sceneStyle.styles || !Array.isArray(config.sceneStyle.styles)) {
    const error =
      "[CesiumContext] prepareSceneInit: config.sceneStyle.styles is undefined or not an array. Must define at least one style.";
    console.error(error);
    throw new Error(error);
  }

  const availableStyles = config.sceneStyle.styles.map((s) => s.id);
  if (availableStyles.length === 0) {
    const error =
      "[CesiumContext] prepareSceneInit: config.sceneStyle.styles array is empty. At least one style must be defined.";
    console.error(error);
    throw new Error(error);
  }

  // 4. Validate requested style exists in styles array
  if (!availableStyles.includes(style)) {
    const error = `[CesiumContext] prepareSceneInit: Style '${style}' not found in config. Available styles: ${availableStyles.join(
      ", "
    )}`;
    console.error(error);
    throw new Error(error);
  }
}
