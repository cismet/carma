import type { Meters } from "@carma-units";

/**
 * A pick ray against a height field, the heights a terrain answers for a
 * geographic position: pure, on the ray's clearance above the field.
 */

export const TERRAIN_RAY_MARCH_DEFAULTS = Object.freeze({
  /**
   * Highest jump the field makes over a short distance (a building in a
   * surface model). Above it the ray can skip ahead; within it it steps
   * finely.
   */
  featureHeightMeters: 150 as Meters,
  /** Steepest ground the skip ahead allows for beyond those features. */
  maxSlope: 3,
  /** Fine step as a share of the distance from the eye: about four pixels. */
  relativeStep: 0.005,
  minStepMeters: 0.25 as Meters,
  toleranceMeters: 0.001 as Meters,
  maxSteps: 1024,
});

export type TerrainRayMarchOptions = typeof TERRAIN_RAY_MARCH_DEFAULTS;

/** The bracketed crossing, bisected to the tolerance; a hole counts as above. */
const bisectCrossing = (
  clearanceAt: (distance: number) => number | undefined,
  above: number,
  below: number,
  tolerance: number
) => {
  let lower = above;
  let upper = below;
  while (upper - lower > tolerance) {
    const middle = (lower + upper) / 2;
    const clearance = clearanceAt(middle);
    if (clearance === undefined || clearance > 0) lower = middle;
    else upper = middle;
  }
  return (lower + upper) / 2;
};

/**
 * The first distance along the ray, within `far`, where its clearance above
 * the field (`clearanceAt`, undefined off the field) comes down to zero.
 * `eyeDistance` is how far the ray's start lies from the eye; the fine step
 * grows with the distance from there. Null when the ray starts below the
 * field, misses it, or needs more than `maxSteps`.
 */
export const marchTerrainRay = (
  clearanceAt: (distance: number) => number | undefined,
  far: number,
  eyeDistance = 0,
  options: TerrainRayMarchOptions = TERRAIN_RAY_MARCH_DEFAULTS
): number | null => {
  const {
    featureHeightMeters,
    maxSlope,
    relativeStep,
    minStepMeters,
    toleranceMeters,
    maxSteps,
  } = options;
  // Steepest closing rate of a ray on a slope of `maxSlope`, at any angle.
  const closing = Math.hypot(1, maxSlope);
  let previous = 0;
  let previousClearance = clearanceAt(0);
  if (previousClearance !== undefined && previousClearance <= 0) return null;
  for (let step = 0; step < maxSteps && previous < far; step += 1) {
    const fine = Math.max(
      minStepMeters,
      (eyeDistance + previous) * relativeStep
    );
    const skip =
      previousClearance === undefined
        ? 0
        : (previousClearance - featureHeightMeters) / closing;
    const distance = Math.min(far, previous + Math.max(fine, skip));
    const clearance = clearanceAt(distance);
    if (
      clearance !== undefined &&
      clearance <= 0 &&
      previousClearance !== undefined
    ) {
      return bisectCrossing(clearanceAt, previous, distance, toleranceMeters);
    }
    previous = distance;
    previousClearance = clearance;
  }
  return null;
};

/**
 * Unit surface normal in east, north, up from the field's heights at
 * `spacing` metres east, west, north and south of a point; null where one is
 * missing.
 */
export const resolveTerrainNormalEnu = (
  heights: {
    east: number | undefined;
    west: number | undefined;
    north: number | undefined;
    south: number | undefined;
  },
  spacing: number
): [east: number, north: number, up: number] | null => {
  const { east, west, north, south } = heights;
  if (
    east === undefined ||
    west === undefined ||
    north === undefined ||
    south === undefined ||
    !(spacing > 0)
  ) {
    return null;
  }
  const x = -(east - west) / (2 * spacing);
  const y = -(north - south) / (2 * spacing);
  const length = Math.hypot(x, y, 1);
  return Number.isFinite(length) ? [x / length, y / length, 1 / length] : null;
};
