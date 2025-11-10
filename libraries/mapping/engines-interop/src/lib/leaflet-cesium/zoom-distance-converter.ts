import { Scene, PerspectiveFrustum } from "@carma/cesium";
import type { Zoom } from "@carma/types";
import { degToRad } from "@carma/units/helpers";
import type { Degrees, Radians } from "@carma/geo/types";
import type { Meters } from "@carma/units/types";
import {
  getPixelResolutionFromZoomAtLatitudeRad,
  getZoomFromPixelResolutionAtLatitudeRad,
} from "@carma/geo/utils";

const DEFAULT_FOV_RADIUS_FACTOR = 0.2;

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
 */
export function createZoomDistanceConverter(
  scene: Scene,
  cssViewportWidth: number,
  cssViewportHeight: number,
  fovRadiusFactor: number = DEFAULT_FOV_RADIUS_FACTOR
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
  const longerEdgeCss = Math.max(cssViewportWidth, cssViewportHeight);
  const samplingRadiusCss = (longerEdgeCss / 2) * fovRadiusFactor;
  const tanAngle = Math.tan(fov / 2) * fovRadiusFactor;

  return {
    zoomToDistance(zoom: Zoom, latitude: Degrees): Meters | null {
      const latRad = degToRad(latitude);
      const metersPerCssPixel = getPixelResolutionFromZoomAtLatitudeRad(
        zoom,
        latRad
      );
      const distance = (metersPerCssPixel * samplingRadiusCss) / tanAngle;
      return distance as Meters;
    },

    distanceToZoom(distance: Meters, latitude: Degrees): Zoom | null {
      const latRad = degToRad(latitude);
      const groundRadiusAtSample = distance * tanAngle;
      const metersPerCSSPixel = groundRadiusAtSample / samplingRadiusCss;
      const zoom = getZoomFromPixelResolutionAtLatitudeRad(
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
 * @param fovRadiusFactor - Where to measure distance match (0.0 = center, 1.0 = edge, default 0.2)
 */
export function calculateDistanceFromZoom(
  scene: Scene,
  cssViewportWidth: number,
  cssViewportHeight: number,
  latitude: Degrees,
  zoom: Zoom,
  fovRadiusFactor: number = DEFAULT_FOV_RADIUS_FACTOR
): Meters | null {
  const converter = createZoomDistanceConverter(
    scene,
    cssViewportWidth,
    cssViewportHeight,
    fovRadiusFactor
  );
  return converter?.zoomToDistance(zoom, latitude) ?? null;
}

/**
 * Calculate Leaflet zoom level from Cesium camera distance
 *
 * Convenience wrapper for one-time conversions.
 * For multiple conversions, use `createZoomDistanceConverter()` instead.
 *
 * @param fovRadiusFactor - Where to measure distance match (0.0 = center, 1.0 = edge, default 0.2)
 */
export function calculateZoomFromDistance(
  scene: Scene,
  cssViewportWidth: number,
  cssViewportHeight: number,
  latitude: Degrees,
  distance: Meters,
  fovRadiusFactor: number = DEFAULT_FOV_RADIUS_FACTOR
): Zoom | null {
  const converter = createZoomDistanceConverter(
    scene,
    cssViewportWidth,
    cssViewportHeight,
    fovRadiusFactor
  );
  return converter?.distanceToZoom(distance, latitude) ?? null;
}
