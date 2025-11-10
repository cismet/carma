import { CesiumMath, Scene, PerspectiveFrustum } from "@carma/cesium";
import type { Zoom } from "@carma/types";
import { degToRad } from "@carma/units/helpers";
import type { Degrees, Radians } from "@carma/geo/types";
import type { Meters } from "@carma/units/types";
import {
  getPixelResolutionFromZoomAtLatitudeRad,
  getZoomFromPixelResolutionAtLatitudeRad,
} from "@carma/geo/utils";

/**
 * Calculate camera distance needed to match Leaflet zoom level
 *
 * Uses CSS viewport dimensions to match Leaflet's pixel-based zoom calculation.
 * Cesium FOV geometry: groundRadius = distance × tan(fov/2)
 */
export function calculateCameraDistance(
  scene: Scene,
  cssViewportWidth: number,
  cssViewportHeight: number,
  latitude: Degrees,
  zoom: Zoom
): number | null {
  const latRad = degToRad(latitude);
  const metersPerCssPixel = getPixelResolutionFromZoomAtLatitudeRad(
    zoom,
    latRad
  );

  const { camera } = scene;

  if (!camera?.frustum || !(camera.frustum instanceof PerspectiveFrustum)) {
    console.warn(
      "[CESIUM|TRANSITION] Camera frustum not available or not perspective"
    );
    return null;
  }

  if (!Number.isFinite(cssViewportHeight) || cssViewportHeight <= 0) {
    console.warn("[CESIUM|TRANSITION] Invalid viewport height");
    return null;
  }

  if (!Number.isFinite(cssViewportWidth) || cssViewportWidth <= 0) {
    console.warn("[CESIUM|TRANSITION] Invalid viewport width");
    return null;
  }

  const fov = camera.frustum.fov;
  const longerEdgeCss = Math.max(cssViewportWidth, cssViewportHeight);

  // Solve: distance × tan(fov/2) = (cssPixels × metersPerCSSPixel) / 2
  const tanHalfFov = Math.tan(fov / 2);
  const computedDistance =
    (metersPerCssPixel * longerEdgeCss) / (2 * tanHalfFov);

  console.log("[CESIUM|TRANSITION] === calculateCameraDistance DEBUG ===");
  console.log("[CESIUM|TRANSITION] Inputs:", {
    zoom,
    latitude,
    cssViewportWidth,
    cssViewportHeight,
    longerEdgeCss,
    aspectRatio: (cssViewportWidth / cssViewportHeight).toFixed(3),
    fovDeg: ((fov * 180) / Math.PI).toFixed(2),
    fovRad: fov.toFixed(4),
  });
  console.log("[CESIUM|TRANSITION] Calculated:", {
    metersPerCssPixel: metersPerCssPixel.toFixed(4) + " m/CSS_px",
    tanHalfFov: tanHalfFov.toFixed(4),
    groundRadius: (computedDistance * tanHalfFov).toFixed(2) + " m",
    computedDistance: computedDistance.toFixed(2) + " m",
  });

  return computedDistance;
}

/**
 * Calculate Leaflet zoom level from Cesium camera distance
 *
 * Inverse of calculateCameraDistance - converts camera height to Leaflet zoom.
 */
export function calculateZoomFromDistance(
  scene: Scene,
  cssViewportWidth: number,
  cssViewportHeight: number,
  latitude: number,
  distance: number
): number | null {
  const latRad = CesiumMath.toRadians(latitude);

  const { camera } = scene;

  if (!camera?.frustum || !(camera.frustum instanceof PerspectiveFrustum)) {
    console.warn(
      "[CESIUM|TRANSITION] Camera frustum not available or not perspective"
    );
    return null;
  }

  if (!Number.isFinite(cssViewportHeight) || cssViewportHeight <= 0) {
    console.warn("[CESIUM|TRANSITION] Invalid viewport height");
    return null;
  }

  if (!Number.isFinite(cssViewportWidth) || cssViewportWidth <= 0) {
    console.warn("[CESIUM|TRANSITION] Invalid viewport width");
    return null;
  }

  const fov = camera.frustum.fov;
  const longerEdgeCss = Math.max(cssViewportWidth, cssViewportHeight);

  const groundRadius = distance * Math.tan(fov / 2);
  const effectiveScreenRadius = longerEdgeCss / 2;
  const metersPerCSSPixel = groundRadius / effectiveScreenRadius;

  const zoom = getZoomFromPixelResolutionAtLatitudeRad(
    metersPerCSSPixel as Meters,
    latRad as Radians
  );

  return zoom;
}
