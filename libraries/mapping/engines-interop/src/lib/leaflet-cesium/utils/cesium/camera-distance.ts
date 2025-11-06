import { CesiumMath, Scene, PerspectiveFrustum } from "@carma/cesium";
import type { Zoom } from "@carma/types";
import { degToRad } from "@carma/units/helpers";
import type { Degrees } from "@carma/geo/types";
import { getPixelResolutionFromZoomAtLatitudeRad } from "@carma/geo/utils";

export function calculateCameraDistance(
  scene: Scene,
  resolutionScale: number,
  latitude: Degrees,
  zoom: Zoom
): number | null {
  const latRad = degToRad(latitude);

  const targetPixelResolution = getPixelResolutionFromZoomAtLatitudeRad(
    zoom,
    latRad
  );

  const { camera, drawingBufferHeight, drawingBufferWidth } = scene;

  if (!camera?.frustum || !(camera.frustum instanceof PerspectiveFrustum)) {
    console.warn(
      "[CESIUM|TRANSITION] Camera frustum not available or not perspective"
    );
    return null;
  }

  if (!Number.isFinite(drawingBufferHeight) || drawingBufferHeight <= 0) {
    console.warn("[CESIUM|TRANSITION] Invalid drawing buffer height");
    return null;
  }

  if (!Number.isFinite(drawingBufferWidth) || drawingBufferWidth <= 0) {
    console.warn("[CESIUM|TRANSITION] Invalid drawing buffer width");
    return null;
  }

  // The FOV always corresponds to the longer edge dimension for cesium
  const aspectRatio = drawingBufferWidth / drawingBufferHeight;
  const fov = camera.frustum.fov; // FOV in radians

  // Use longer edge and its corresponding FOV
  const longerEdge = Math.max(drawingBufferWidth, drawingBufferHeight);

  const effectiveRadiusPixels = longerEdge / 2;

  // For perspective projection:
  // Solving for distance from: metersPerCSSPixel = (2 * distance * tan(fov/2)) / (drawingBufferHeight * resolutionScale)
  // Distance = (metersPerCSSPixel * drawingBufferHeight * resolutionScale) / (2 * tan(fov/2))
  // Where resolutionScale converts device pixels → CSS pixels (typically window.devicePixelRatio)
  const tanHalfFov = Math.tan(fov / 2);
  const computedDistance =
    (targetPixelResolution * effectiveRadiusPixels) /
    (tanHalfFov * resolutionScale);

  console.log("[CESIUM|TRANSITION] === calculateCameraDistance DEBUG ===");
  console.log("[CESIUM|TRANSITION] Inputs:", {
    zoom,
    latitude,
    resolutionScale,
    drawingBufferWidth,
    drawingBufferHeight,
    longerEdge,
    aspectRatio: aspectRatio.toFixed(3),
    fovDeg: ((fov * 180) / Math.PI).toFixed(2),
    fovRad: fov.toFixed(4),
  });
  console.log("[CESIUM|TRANSITION] Calculated:", {
    targetPixelResolution: targetPixelResolution.toFixed(4) + " m/px (CSS)",
    tanHalfFov: tanHalfFov.toFixed(4),
    computedDistance: computedDistance.toFixed(2) + " m",
  });

  return computedDistance;
}

export function calculateZoomFromDistance(
  scene: Scene,
  resolutionScale: number,
  latitude: number,
  distance: number
): number | null {
  const latRad = CesiumMath.toRadians(latitude);

  const { camera, drawingBufferHeight } = scene;

  if (!camera?.frustum || !(camera.frustum instanceof PerspectiveFrustum)) {
    console.warn(
      "[CESIUM|TRANSITION] Camera frustum not available or not perspective"
    );
    return null;
  }

  if (!Number.isFinite(drawingBufferHeight) || drawingBufferHeight <= 0) {
    console.warn("[CESIUM|TRANSITION] Invalid drawing buffer height");
    return null;
  }

  const fov = camera.frustum.fov; // vertical FOV in radians

  // Calculate current pixel resolution from distance and FOV
  // pixelResolution = (2 * distance * tan(fov/2)) / (heightInPixels * resolutionScale)
  const tanHalfFov = Math.tan(fov / 2);
  const metersPerPixel =
    (2 * distance * tanHalfFov) / (drawingBufferHeight * resolutionScale);

  // Find zoom level that produces this pixel resolution
  const EARTH_CIRCUMFERENCE = 40075016.686; // meters at equator
  const TILE_SIZE = 256;

  const metersPerPixelAtEquator = metersPerPixel / Math.cos(latRad);
  const zoom = Math.log2(
    EARTH_CIRCUMFERENCE / (metersPerPixelAtEquator * TILE_SIZE)
  );

  return zoom;
}
