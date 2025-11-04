import { CesiumMath, Scene } from "@carma/cesium";
import type { Zoom } from "@carma/types";
import { degToRad } from "@carma/units/helpers";
import type { Degrees, LatLng } from "@carma/geo/types";
import { getPixelResolutionFromZoomAtLatitudeRad } from "@carma/geo/utils";

import { getPixelDimensionsForDistance } from "./get-pixel-dimensions-for-distance";

// TODO: move to config or formalize the starting distance value
const START_DISTANCE = 1000;

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

  const baseComputedPixelResolution = getPixelDimensionsForDistance(
    scene,
    resolutionScale,
    START_DISTANCE
  )?.average;

  if (
    baseComputedPixelResolution === null ||
    baseComputedPixelResolution === undefined
  ) {
    console.warn(
      "[CESIUM|TRANSITION] No base computed pixel resolution found for distance",
      START_DISTANCE
    );
    return null;
  }

  const resolutionRatio = targetPixelResolution / baseComputedPixelResolution;
  const computedDistance = START_DISTANCE * resolutionRatio;

  return computedDistance;
}

export function calculateZoomFromDistance(
  scene: Scene,
  resolutionScale: number,
  latitude: number,
  distance: number
): number | null {
  const latRad = CesiumMath.toRadians(latitude);

  const baseComputedPixelResolution = getPixelDimensionsForDistance(
    scene,
    resolutionScale,
    START_DISTANCE
  )?.average;

  if (
    baseComputedPixelResolution === null ||
    baseComputedPixelResolution === undefined
  ) {
    console.warn(
      "[CESIUM|TRANSITION] No base computed pixel resolution found for distance",
      START_DISTANCE
    );
    return null;
  }

  // Current pixel resolution at given distance
  const currentPixelDimension = getPixelDimensionsForDistance(
    scene,
    resolutionScale,
    distance
  )?.average;

  if (currentPixelDimension === null || currentPixelDimension === undefined) {
    console.warn(
      "[CESIUM|TRANSITION] No pixel resolution found for distance",
      distance
    );
    return null;
  }

  // Find zoom level that produces this pixel resolution
  // Using binary search or reverse calculation
  // For now, approximate using the inverse of the zoom-to-resolution formula
  const EARTH_CIRCUMFERENCE = 40075016.686; // meters at equator
  const TILE_SIZE = 256;

  const metersPerPixel = currentPixelDimension;
  const metersPerPixelAtEquator = metersPerPixel / Math.cos(latRad);
  const zoom = Math.log2(
    EARTH_CIRCUMFERENCE / (metersPerPixelAtEquator * TILE_SIZE)
  );

  return zoom;
}
