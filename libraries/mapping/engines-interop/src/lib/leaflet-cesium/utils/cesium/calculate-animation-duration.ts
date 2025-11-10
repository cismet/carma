import type { Camera } from "@carma/cesium";
import { PI } from "@carma/units/helpers";
import {
  getTopDownCameraDeviationAngle,
  getHeadingPitchRollDiff,
} from "@carma/cesium";
import { QUADRATIC_OUT } from "@carma-commons/math";

const DEFAULT_MAX_DURATION_MS = 3000;
const DEFAULT_ANGLE_MAX_DURATION_MS = 3000;
const DEFAULT_HEADING_MAX_DURATION_MS = 3000;
const DEFAULT_ZOOM_DIFF_LOG_WEIGHT_MS = 1000;

export const calculateAnimationDuration = (
  camera: Camera,
  zoomDiff: number,
  {
    maxDurationMs = DEFAULT_MAX_DURATION_MS,
    angleWeightMs = DEFAULT_ANGLE_MAX_DURATION_MS,
    headingWeightMs = DEFAULT_HEADING_MAX_DURATION_MS,
    zoomDiffWeightMs = DEFAULT_ZOOM_DIFF_LOG_WEIGHT_MS,
  }: {
    maxDurationMs?: number;
    angleWeightMs?: number;
    headingWeightMs?: number;
    zoomDiffWeightMs?: number;
  } = {}
): number => {
  // Pitch deviation from top-down (0 to π)
  const deviationAngle = getTopDownCameraDeviationAngle(camera);
  const normalizedAngle = deviationAngle / PI;
  const easedAngle = QUADRATIC_OUT(normalizedAngle);
  const angleDurationMs = easedAngle * angleWeightMs;

  // Heading deviation from north (0 to π for shortest rotation)
  const { heading: headingDiff } = getHeadingPitchRollDiff(camera);
  const normalizedHeading = headingDiff / PI;
  const easedHeading = QUADRATIC_OUT(normalizedHeading);
  const headingDurationMs = easedHeading * headingWeightMs;

  // Zoom change duration
  const zoomDurationMs = Math.log2(1 + Math.abs(zoomDiff)) * zoomDiffWeightMs;

  // Take maximum of all three components
  const durationMs = Math.max(
    angleDurationMs,
    headingDurationMs,
    zoomDurationMs
  );

  return Math.min(durationMs, maxDurationMs);
};
