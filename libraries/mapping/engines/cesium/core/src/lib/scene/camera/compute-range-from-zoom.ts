import type { Zoom } from "@carma/types";
import type { LatLng } from "@carma/geo/types";
import type { Radians, Degrees, Meters } from "@carma/units/types";
import type { Scene } from "@carma/cesium";

import { getPixelResolutionFromZoomAtLatitudeRad } from "@carma/geo/utils";
import { degToRad } from "@carma-commons/units/helpers";
import { getFrustumPixelDimensionsForDistance } from "@carma/cesium";

// TODO: move to config or formalize the starting distance value
const START_DISTANCE = 1000;

/**
 * Computes the camera range (distance from ground) needed to match a Leaflet zoom level.
 *
 * Bridges between Leaflet's zoom-based system and Cesium's range-based camera positioning.
 * This is a core utility used by:
 * - 2D→3D transitions (positioning camera to match Leaflet view)
 * - 3D→2D transitions (computing zoom level from Cesium camera)
 * - Camera synchronization between Leaflet and Cesium
 *
 * @param scene - Cesium scene (needed for frustum calculations)
 * @param latLng - Target latitude/longitude
 * @param zoom - Leaflet zoom level
 * @param pixelRatio - UNUSED (kept for API compatibility). Cesium compensates internally, we only adjust Leaflet side
 * @returns Range in meters from ground, or null if calculation failed
 */
export const computeRangeFromZoom = (
  scene: Scene,
  { latitude }: LatLng.deg,
  zoom: Zoom,
  pixelRatio: number  // eslint-disable-line @typescript-eslint/no-unused-vars -- Kept for API compatibility
): Meters | null => {
  const latRad = degToRad(latitude as Degrees);

  // Calculate target pixel resolution from Leaflet zoom level
  const baseTargetPixelResolution = getPixelResolutionFromZoomAtLatitudeRad(
    zoom,
    latRad as Radians
  );

  // Adjust for device pixel ratio (Leaflet uses retina tiles on high-DPI displays)
  const actualDPR = window.devicePixelRatio || 1;
  const LEAFLET_DPR_FACTOR = 1 / actualDPR;
  const targetPixelResolution = baseTargetPixelResolution * LEAFLET_DPR_FACTOR;

  const baseComputedPixelResolution = getFrustumPixelDimensionsForDistance(
    scene.camera.frustum as any, // PerspectiveFrustum
    scene.drawingBufferWidth,
    scene.drawingBufferHeight,
    START_DISTANCE,
    pixelRatio
  )?.average;

  if (
    baseComputedPixelResolution === null ||
    baseComputedPixelResolution === undefined
  ) {
    console.warn(
      "[computeRangeFromZoom] No base computed pixel resolution found for distance",
      START_DISTANCE
    );
    return null;
  }

  const resolutionRatio = targetPixelResolution / baseComputedPixelResolution;
  const computedDistance = START_DISTANCE * resolutionRatio;

  return computedDistance as Meters;
};
