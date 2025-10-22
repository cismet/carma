/**
 * Validation utilities for Cesium objects.
 *
 * These validators use lazy-loaded type guards from @carma/cesium/api
 * after Cesium is initialized. Before initialization, they fall back
 * to basic property checks.
 *
 * @see lazy-validators.ts for the caching mechanism
 */

import {
  isValidSceneSync,
  isValidCameraSync,
  areLazyValidatorsInitialized,
} from "./lazy-validators";

/**
 * Type guard to check if a value is a valid Cesium Scene
 * Uses lazy validator if initialized, otherwise falls back to property check
 */
export const isValidScene = (scene: unknown): scene is any => {
  // Use lazy validator if available
  if (areLazyValidatorsInitialized()) {
    try {
      return isValidSceneSync(scene);
    } catch {
      // Fall through to property check if error
    }
  }

  // Fallback property check (before Cesium loads)
  return (
    scene !== null &&
    scene !== undefined &&
    typeof scene === "object" &&
    "isDestroyed" in scene &&
    typeof (scene as Record<string, unknown>).isDestroyed === "function" &&
    (scene as any).isDestroyed() === false
  );
};

/**
 * Type guard to check if a value is a valid Cesium Camera
 * Uses lazy validator if initialized, otherwise falls back to property check
 */
export const isValidCamera = (camera: unknown): camera is any => {
  // Use lazy validator if available
  if (areLazyValidatorsInitialized()) {
    try {
      return isValidCameraSync(camera);
    } catch {
      // Fall through to property check if error
    }
  }

  // Fallback property check (before Cesium loads)
  return (
    camera !== null &&
    camera !== undefined &&
    typeof camera === "object" &&
    "position" in camera &&
    "direction" in camera
  );
};

/**
 * Type guard to check if a value is a valid Cesium ImageryLayer
 */
export const isValidImageryLayer = (
  imageryLayer: unknown
): imageryLayer is any => {
  return (
    imageryLayer !== null &&
    imageryLayer !== undefined &&
    typeof imageryLayer === "object" &&
    "show" in imageryLayer &&
    "imageryProvider" in imageryLayer
  );
};

/**
 * Type guard to check if a value is a valid Cesium ScreenSpaceCameraController
 */
export const isValidScreenSpaceCameraController = (
  sscc: unknown
): sscc is any => {
  return (
    sscc !== null &&
    sscc !== undefined &&
    typeof sscc === "object" &&
    "isDestroyed" in sscc &&
    typeof (sscc as any).isDestroyed === "function" &&
    (sscc as any).isDestroyed() === false
  );
};
