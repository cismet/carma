import { Scene, PerspectiveFrustum } from "@carma/cesium";
import type { Zoom } from "@carma/types";
import { degToRad } from "@carma/units/helpers";
import type { Degrees, Radians } from "@carma/geo/types";
import type { Meters } from "@carma/units/types";
import {
  getPixelResolutionFromZoomAtLatitudeRad,
  getZoomFromPixelResolutionAtLatitudeRad,
} from "@carma/geo/utils";

/**
 * Default resolution match radius: 0.2 means matching at 20% of the way from center to edge.
 * This provides a good balance between center and edge, minimizing overall visual error.
 */
const DEFAULT_RESOLUTION_MATCH_RADIUS = 0.2;

/**
 * Converter for bidirectional zoom ↔ distance conversions
 */
export interface ZoomDistanceConverter {
  zoomToDistance(zoom: Zoom, latitude: Degrees): Meters | null;
  distanceToZoom(distance: Meters, latitude: Degrees): Zoom | null;
}

/**
 * Create a zoom/distance converter with fixed scene and viewport parameters
 *
 * Useful when performing multiple conversions with the same viewport configuration.
 * Latitude is still parameterized since it changes during microcorrections.
 *
 * @param resolutionMatchRadius - Interpolation factor (0.0 = center, 1.0 = edge, default 0.2)
 *   Controls where in the FOV frustum resolution/zoom matching occurs.
 *   0.0 = match at viewport center (nadir, shortest distance)
 *   1.0 = match at viewport edge (oblique, longest distance)
 *   Intermediate values interpolate between center and edge distances.
 */
export function createZoomDistanceConverter(
  scene: Scene,
  cssViewportWidth: number,
  cssViewportHeight: number,
  resolutionMatchRadius: number = DEFAULT_RESOLUTION_MATCH_RADIUS
): ZoomDistanceConverter | null {
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
  const halfFov = fov / 2;
  const longerEdgeCss = Math.max(cssViewportWidth, cssViewportHeight);
  const effectiveRadiusCss = longerEdgeCss / 2;
  const halfFovTan = Math.tan(halfFov);

  // Find the angle to the match point on the ground plane
  // resolutionMatchRadius interpolates ground position: 0 = center, 1 = perimeter
  const groundRadiusNormalized = resolutionMatchRadius; // 0..1
  const angleToMatchPoint = Math.atan(groundRadiusNormalized * halfFovTan);
  const matchRadiusFactor = Math.cos(angleToMatchPoint); // decreases distance for off-center match

  return {
    zoomToDistance(zoom: Zoom, latitude: Degrees): Meters | null {
      const latRad = degToRad(latitude);
      const metersPerCssPixel = getPixelResolutionFromZoomAtLatitudeRad(
        zoom,
        latRad
      );
      const distance = (metersPerCssPixel * effectiveRadiusCss) / halfFovTan;
      const effectiveDistance = distance * matchRadiusFactor;
      return effectiveDistance as Meters;
    },

    distanceToZoom(distance: Meters, latitude: Degrees): Zoom | null {
      const latRad = degToRad(latitude);
      const groundRadius = (distance / matchRadiusFactor) * halfFovTan;
      const metersPerCSSPixel = groundRadius / effectiveRadiusCss;
      const zoom = getZoomFromPixelResolutionAtLatitudeRad(
        //metersPerCSSPixel as Meters,
        metersPerCSSPixel as Meters,
        latRad as Radians
      );
      return zoom as Zoom;
    },
  };
}

/**
 * Calculate camera distance needed to match Leaflet zoom level
 *
 * Convenience wrapper for one-time conversions.
 * For multiple conversions, use `createZoomDistanceConverter()` instead.
 *
 * @param resolutionMatchRadius - Where to measure distance match (0.0 = center, 1.0 = edge, default 0.2)
 */
export function calculateDistanceFromZoom(
  scene: Scene,
  cssViewportWidth: number,
  cssViewportHeight: number,
  latitude: Degrees,
  zoom: Zoom,
  resolutionMatchRadius: number = DEFAULT_RESOLUTION_MATCH_RADIUS
): Meters | null {
  const converter = createZoomDistanceConverter(
    scene,
    cssViewportWidth,
    cssViewportHeight,
    resolutionMatchRadius
  );
  return converter?.zoomToDistance(zoom, latitude) ?? null;
}

/**
 * Calculate Leaflet zoom level from Cesium camera distance
 *
 * Convenience wrapper for one-time conversions.
 * For multiple conversions, use `createZoomDistanceConverter()` instead.
 *
 * @param resolutionMatchRadius - Where to measure distance match (0.0 = center, 1.0 = edge, default 0.2)
 */
export function calculateZoomFromDistance(
  scene: Scene,
  cssViewportWidth: number,
  cssViewportHeight: number,
  latitude: Degrees,
  distance: Meters,
  resolutionMatchRadius: number = DEFAULT_RESOLUTION_MATCH_RADIUS
): Zoom | null {
  const converter = createZoomDistanceConverter(
    scene,
    cssViewportWidth,
    cssViewportHeight,
    resolutionMatchRadius
  );
  return converter?.distanceToZoom(distance, latitude) ?? null;
}
