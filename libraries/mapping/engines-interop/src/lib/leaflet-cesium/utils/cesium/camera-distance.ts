import { CesiumMath, Scene, PerspectiveFrustum } from "@carma/cesium";
import type { Zoom } from "@carma/types";
import { degToRad } from "@carma/units/helpers";
import type { Degrees } from "@carma/geo/types";
import { getPixelResolutionFromZoomAtLatitudeRad } from "@carma/geo/utils";

/**
 * Calculate ground radius covered by FOV at given distance
 * Pure geometric relationship - no buffer size needed!
 *
 * @param distance - Camera distance from ground in meters
 * @param fovRadians - Field of view in radians
 * @returns Ground radius in meters
 */
export function getGroundRadiusFromFOV(
  distance: number,
  fovRadians: number
): number {
  return distance * Math.tan(fovRadians / 2);
}

/**
 * Calculate pixel resolution at given distance from FOV center
 *
 * @param distance - Camera distance from ground in meters
 * @param fovRadians - Field of view in radians
 * @returns Meters covered by FOV diameter at center
 *
 * Future: Add normalizedRadius parameter for oblique angle correction
 * normalizedRadius = sqrt(dx² + dy²) where dx, dy are normalized viewport coords
 */
export function getPixelResolutionAtRadius(
  distance: number,
  fovRadians: number
): number {
  // At center: resolution = 2 × distance × tan(fov/2)
  // At edge: resolution increases due to oblique angle (not yet implemented)
  const groundRadius = getGroundRadiusFromFOV(distance, fovRadians);
  return 2 * groundRadius; // Ground distance covered by FOV diameter
}

export function calculateCameraDistance(
  scene: Scene,
  cssViewportWidth: number,
  cssViewportHeight: number,
  latitude: Degrees,
  zoom: Zoom
): number | null {
  const latRad = degToRad(latitude);

  // Get target pixel resolution in meters per CSS pixel (from Leaflet zoom)
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

  const fov = camera.frustum.fov; // FOV in radians (for longer edge)
  const longerEdgeCss = Math.max(cssViewportWidth, cssViewportHeight);

  // PURE GEOMETRY: No DPR needed!
  //
  // Leaflet defines zoom by: metersPerCSSPixel at center of viewport
  // Cesium FOV defines: groundRadius = distance × tan(fov/2)
  //
  // To match Leaflet's zoom in Cesium:
  // 1. Determine ground distance visible in viewport: cssPixels × metersPerCSSPixel
  // 2. This is the ground diameter, so groundRadius = (cssPixels × metersPerCSSPixel) / 2
  // 3. Solve for distance: distance × tan(fov/2) = groundRadius
  //
  // Result: distance = (cssPixels × metersPerCSSPixel) / (2 × tan(fov/2))

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

  const fov = camera.frustum.fov; // FOV in radians (for longer edge)
  const longerEdgeCss = Math.max(cssViewportWidth, cssViewportHeight);

  // PURE GEOMETRY: No DPR needed!
  // groundDiameter = 2 × distance × tan(fov/2)  [meters]
  // metersPerCSSPixel = groundDiameter / cssPixels
  const tanHalfFov = Math.tan(fov / 2);
  const groundDiameter = 2 * distance * tanHalfFov;
  const metersPerCSSPixel = groundDiameter / longerEdgeCss;

  // Convert meters per CSS pixel to Leaflet zoom level
  // Account for latitude (Web Mercator distortion)
  const EARTH_CIRCUMFERENCE = 40075016.686; // meters at equator
  const TILE_SIZE = 256; // CSS pixels

  const metersPerPixelAtEquator = metersPerCSSPixel / Math.cos(latRad);
  const zoom = Math.log2(
    EARTH_CIRCUMFERENCE / (metersPerPixelAtEquator * TILE_SIZE)
  );

  return zoom;
}
