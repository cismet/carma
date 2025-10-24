/**
 * Camera utilities for cesium/core
 *
 * **Re-exported from @carma/cesium (API layer):**
 * - getTopDownCameraDeviationAngle (primitive: Camera → Radians)
 * - applyRollToHeadingForCameraNearNadir (primitive: Camera → Radians)
 * - DEFAULT_MIN_FOV, DEFAULT_MAX_FOV (elemental constants)
 * - isValidFov, clampToValidFov (elemental validation)
 * - getFrustumPixelDimensionsForDistance (primitive: frustum + dimensions → pixels)
 *
 * **Core animation utilities:**
 * - computeNextFov (animation interpolation - uses geometric scaling)
 */

// Re-export primitive camera utilities from API for convenience
export {
  getTopDownCameraDeviationAngle,
  applyRollToHeadingForCameraNearNadir,
  getFrustumPixelDimensionsForDistance,
} from "@carma/cesium";

// FOV utilities (animation-specific, also re-exports elemental constants from API)
export * from "./fov";

// Zoom/range conversion utilities (depends on geo/utils)
export * from "./compute-range-from-zoom";
export * from "./leaflet-to-topdown-cesium-pose";

// Scene-dependent utilities (depends on cesium/core internals)
export * from "./get-camera-height-above-ground";
export * from "./cesium-camera-force-oblique";
export * from "./camera-to-css-transform";
export * from "./animations";
