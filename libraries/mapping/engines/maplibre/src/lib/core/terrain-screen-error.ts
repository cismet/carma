import { degToRadNumeric } from "@carma-units";

/** Observer source-LOD estimate, not a surveyed vertical residual. */
export const getTerrainScreenErrorRatio = (
  geometricErrorMeters: number,
  viewportHeight: number,
  fovDegrees: number,
  distanceMeters: number,
  targetPixels: number
) =>
  (geometricErrorMeters * viewportHeight) /
  (2 *
    Math.tan(degToRadNumeric(fovDegrees) / 2) *
    Math.max(1, distanceMeters) *
    targetPixels);

/** Display-referred tile classes; unlit materials keep sunlight out of the metric. */
export const getTerrainScreenErrorColor = (ratio: number) =>
  ratio <= 0.5
    ? 0x38bdf8
    : ratio <= 1
    ? 0x22c55e
    : ratio <= 2
    ? 0xfacc15
    : ratio <= 4
    ? 0xf97316
    : 0xef4444;
