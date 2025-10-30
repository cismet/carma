import type { LatLng, Zoom } from "@carma/types";
import {
  asRadians,
  getPixelResolutionFromZoomAtLatitudeRad,
} from "@carma-commons/utils";
import { Math as CesiumMath } from "cesium";

import type { CesiumContextType } from "../../CesiumContext";
import { getCesiumCameraPixelDimensionForDistance } from "../cesiumCamera";

// TODO: move to config or formalize the starting distance value
const START_DISTANCE = 1000;

/**
 * Calculates the required camera distance above ground based on zoom level and latitude.
 * This provides an excellent initial camera position without needing terrain data.
 *
 * @param ctx - The Cesium context
 * @param latitude - Latitude in degrees
 * @param zoom - Web map zoom level
 * @returns Camera distance in meters, or null if calculation fails
 */
export function calculateCameraDistance(
  ctx: CesiumContextType,
  latitude: number,
  zoom: Zoom
): number | null {
  const latRad = CesiumMath.toRadians(latitude);

  const targetPixelResolution = getPixelResolutionFromZoomAtLatitudeRad(
    zoom,
    asRadians(latRad)
  );

  const baseComputedPixelResolution = getCesiumCameraPixelDimensionForDistance(
    ctx,
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

/**
 * Inverse function: calculates the zoom level from latitude, camera distance, and pixel size.
 * Useful for determining what zoom level corresponds to a given camera position.
 *
 * @param ctx - The Cesium context
 * @param latitude - Latitude in degrees
 * @param distance - Camera distance above ground in meters
 * @returns Web map zoom level, or null if calculation fails
 */
export function calculateZoomFromDistance(
  ctx: CesiumContextType,
  latitude: number,
  distance: number
): number | null {
  const latRad = CesiumMath.toRadians(latitude);

  const baseComputedPixelResolution = getCesiumCameraPixelDimensionForDistance(
    ctx,
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
  const currentPixelDimension = getCesiumCameraPixelDimensionForDistance(
    ctx,
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
