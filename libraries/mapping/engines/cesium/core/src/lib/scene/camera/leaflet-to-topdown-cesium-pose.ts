import type { Zoom } from "@carma/types";
import type { LatLng, Altitude } from "@carma/geo/types";
import type { Meters, Radians, Degrees } from "@carma/units/types";
import type { Scene, HeadingPitchRollPrimitive } from "@carma/cesium";
import {
  degToRad,
  MINUS_PI_OVER_TWO,
  ZERO_PI,
} from "@carma-commons/units/helpers";
import { computeRangeFromZoom } from "./compute-range-from-zoom";

// Default fallback height when terrain not available (conservative: works globally)
const DEFAULT_FALLBACK_HEIGHT_M = 10000;

export type ElevationSource = "fallback" | "terrain";

/**
 * Cesium camera pose with fallback elevation.
 *
 * Uses a conservative fallback height until terrain can be sampled.
 * Check `elevationSource` to determine if terrain sampling is needed.
 */
export type CesiumPoseWithFallback = HeadingPitchRollPrimitive.rad & {
  /** Position in radians */
  latitude: Radians;
  longitude: Radians;
  height: Meters;
  /** Range/distance from ground (computed from zoom level) */
  range: number;
  /** Source of elevation: 'fallback' (constant) or 'terrain' (sampled) */
  elevationSource: ElevationSource;
};

/**
 * Converts Leaflet map position (lat/lng/zoom) to a top-down Cesium camera pose.
 *
 * Uses a fallback height (conservative estimate) until terrain can be sampled.
 * The `elevationSource` field indicates whether terrain sampling is needed.
 *
 * **Fallback height:** Default 10000m (global), configurable per region:
 * - Wuppertal: 400m (max elevation ~400m)
 * - Flat regions: Can use lower values for better initial view
 *
 * @param scene - Cesium scene (needed for frustum calculations)
 * @param latLng - Latitude/longitude from Leaflet map center
 * @param zoom - Zoom level from Leaflet map
 * @param pixelRatio - UNUSED (kept for API compatibility). Cesium compensates internally
 * @param options - Optional configuration
 * @param options.fallbackHeightM - Fallback ground elevation in meters (default: 10000m)
 * @returns Pose with fallback elevation and source indicator
 */
export const leafletToTopdownCesiumPose = (
  scene: Scene,
  { latitude, longitude }: LatLng.deg,
  zoom: Zoom,
  pixelRatio: number,  // eslint-disable-line @typescript-eslint/no-unused-vars -- Kept for API compatibility
  options?: {
    fallbackHeightM?: number;
  }
): CesiumPoseWithFallback | null => {
  // Compute range using shared utility (also used by tiledMapToCesium)
  const range = computeRangeFromZoom(
    scene,
    { latitude, longitude },
    zoom,
    pixelRatio
  );

  if (range === null) {
    return null;
  }

  const fallbackHeightM = options?.fallbackHeightM ?? DEFAULT_FALLBACK_HEIGHT_M;

  // Convert lat/lng from degrees to radians for CameraPoseRadians
  const latitudeRad = degToRad(latitude as Degrees) as Radians;
  const longitudeRad = degToRad(longitude as Degrees) as Radians;

  // Return pose with fallback elevation
  // Scene init will replace with terrain-sampled elevation if provider available
  return {
    latitude: latitudeRad,
    longitude: longitudeRad,
    height: (fallbackHeightM + range) as Meters, // Fallback: conservative estimate
    range,
    heading: ZERO_PI, // North
    pitch: MINUS_PI_OVER_TWO, // Nadir (top-down view)
    roll: ZERO_PI, // No roll
    elevationSource: "fallback", // Indicates terrain sampling recommended
  };
};
