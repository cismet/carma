/**
 * Lazy-loaded validators for complex Cesium types
 *
 * These validators cache the imported type guards from @carma/cesium/api
 * so they only need to be loaded once, then can be used synchronously.
 *
 * **Usage:**
 * ```typescript
 * // Initialize once when Cesium loads
 * await initializeLazyValidators();
 *
 * // Then use synchronously
 * if (isPerspectiveFrustumSync(frustum)) { ... }
 * ```
 *
 * @module lazy-validators
 */

type TypeGuard<T> = (obj: unknown) => obj is T;

// Cached type guards
let _isPerspectiveFrustum: TypeGuard<unknown> | null = null;
let _isValidScene: TypeGuard<unknown> | null = null;
let _isValidCamera: TypeGuard<unknown> | null = null;

/**
 * Initialize lazy validators by importing type guards from @carma/cesium
 * Call this once when Cesium is first loaded (e.g., in useInitCesiumWidget)
 */
export const initializeLazyValidators = async (): Promise<void> => {
  if (_isPerspectiveFrustum) return; // Already initialized

  const { isPerspectiveFrustum, isValidScene, isValidCamera } = await import(
    "@carma/cesium"
  );

  _isPerspectiveFrustum = isPerspectiveFrustum;
  _isValidScene = isValidScene;
  _isValidCamera = isValidCamera;
};

/**
 * Check if a frustum is a PerspectiveFrustum (synchronous after initialization)
 * @param frustum - The frustum to check
 * @returns true if the frustum is a PerspectiveFrustum
 * @throws Error if validators haven't been initialized
 */
export const isPerspectiveFrustumSync = (frustum: unknown): boolean => {
  if (!_isPerspectiveFrustum) {
    throw new Error(
      "isPerspectiveFrustumSync called before initialization. " +
        "Ensure initializeLazyValidators() is called when Cesium loads."
    );
  }
  return _isPerspectiveFrustum(frustum);
};

/**
 * Check if a scene is valid (synchronous after initialization)
 * @param scene - The scene to check
 * @returns true if the scene is valid
 * @throws Error if validators haven't been initialized
 */
export const isValidSceneSync = (scene: unknown): boolean => {
  if (!_isValidScene) {
    throw new Error(
      "isValidSceneSync called before initialization. " +
        "Ensure initializeLazyValidators() is called when Cesium loads."
    );
  }
  return _isValidScene(scene);
};

/**
 * Check if a camera is valid (synchronous after initialization)
 * @param camera - The camera to check
 * @returns true if the camera is valid
 * @throws Error if validators haven't been initialized
 */
export const isValidCameraSync = (camera: unknown): boolean => {
  if (!_isValidCamera) {
    throw new Error(
      "isValidCameraSync called before initialization. " +
        "Ensure initializeLazyValidators() is called when Cesium loads."
    );
  }
  return _isValidCamera(camera);
};

/**
 * Check if lazy validators have been initialized
 */
export const areLazyValidatorsInitialized = (): boolean => {
  return _isPerspectiveFrustum !== null;
};

/**
 * Type guard to check if a value is a valid Cesium Scene
 * Uses lazy validator if initialized, otherwise falls back to property check
 */
export const isValidScene = (scene: unknown): boolean => {
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
export const isValidCamera = (camera: unknown): boolean => {
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
export const isValidImageryLayer = (imageryLayer: unknown): boolean => {
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
export const isValidScreenSpaceCameraController = (sscc: unknown): boolean => {
  return (
    sscc !== null &&
    sscc !== undefined &&
    typeof sscc === "object" &&
    "isDestroyed" in sscc &&
    typeof (sscc as Record<string, unknown>).isDestroyed === "function" &&
    (sscc as any).isDestroyed() === false
  );
};
