import type { Vector3 } from "three";

/**
 * The dashed guide along the active axis through the gizmo point: it reaches
 * `lengthMultiplier` camera distances to either side, dashes and gaps in CSS
 * pixels at the point. Distance times pixels per metre stays the same while
 * the camera dollies, so a dash count taken once keeps the pixel pitch.
 */
export const ROTATION_AXIS_DASHES = Object.freeze({
  lengthMultiplier: 2,
  dashPx: 5,
  gapPx: 3,
  /** Used while the view gives no scale. */
  fallbackCount: 256,
  maxCount: 1024,
});

/** Dashes along the whole axis for the view at the point. */
export const getRotationAxisDashCount = (
  cameraDistanceMeters: number | null,
  pixelsPerMeter: number
): number => {
  const axisLengthPx =
    2 *
    ROTATION_AXIS_DASHES.lengthMultiplier *
    (cameraDistanceMeters ?? 0) *
    pixelsPerMeter;
  const count = Math.floor(
    axisLengthPx / (ROTATION_AXIS_DASHES.dashPx + ROTATION_AXIS_DASHES.gapPx)
  );
  return Number.isFinite(count) && count > 0
    ? Math.min(count, ROTATION_AXIS_DASHES.maxCount)
    : ROTATION_AXIS_DASHES.fallbackCount;
};

/** Dash `index` of `count` spread evenly over the axis, as its two endpoints. */
export const getRotationAxisDash = (
  origin: Vector3,
  unitDirection: Vector3,
  cameraDistanceMeters: number,
  count: number,
  index: number
): [Vector3, Vector3] => {
  const halfLength =
    cameraDistanceMeters * ROTATION_AXIS_DASHES.lengthMultiplier;
  const period = (2 * halfLength) / count;
  const dash =
    (period * ROTATION_AXIS_DASHES.dashPx) /
    (ROTATION_AXIS_DASHES.dashPx + ROTATION_AXIS_DASHES.gapPx);
  const start = -halfLength + index * period;
  return [
    origin.clone().addScaledVector(unitDirection, start),
    origin.clone().addScaledVector(unitDirection, start + dash),
  ];
};
