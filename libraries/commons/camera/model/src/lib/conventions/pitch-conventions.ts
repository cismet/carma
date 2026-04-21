import {
  MINUS_PI_OVER_TWO,
  ZERO_PI,
  degToRadNumeric,
  radToDegNumeric,
  PI_OVER_TWO,
  type Radians,
} from "@carma-units";

/**
 * CARMA view pitch convention:
 * - `0` = nadir / top-down
 * - `PI/2` = horizon
 *
 * Cesium camera pitch convention:
 * - `-PI/2` = nadir / top-down
 * - `0` = horizon
 */

export const CARMA_VIEW_NADIR_PITCH_RAD = ZERO_PI as Radians;
export const CARMA_VIEW_HORIZON_PITCH_RAD = PI_OVER_TWO as Radians;
export const CESIUM_NADIR_PITCH_RAD = MINUS_PI_OVER_TWO as Radians;
export const CESIUM_HORIZON_PITCH_RAD = ZERO_PI as Radians;

export const fromCarmaViewPitchRadToCesiumPitchRad = (
  pitchRad: Radians
): Radians => (pitchRad - PI_OVER_TWO) as Radians;

export const fromCarmaViewPitchDegToCesiumPitchRad = (
  pitchDeg: number
): Radians | undefined => {
  const pitchRad = degToRadNumeric(pitchDeg);
  return typeof pitchRad === "number"
    ? fromCarmaViewPitchRadToCesiumPitchRad(pitchRad as Radians)
    : undefined;
};

export const fromCesiumPitchRadToCarmaViewPitchRad = (
  pitchRad: Radians
): Radians => (pitchRad + PI_OVER_TWO) as Radians;

export const fromCesiumPitchRadToCarmaViewPitchDeg = (
  pitchRad: Radians
): number | undefined =>
  radToDegNumeric(fromCesiumPitchRadToCarmaViewPitchRad(pitchRad));

export const computeCesiumPitchDistanceFromNadir = (
  pitchRad: Radians
): Radians =>
  Math.abs(fromCesiumPitchRadToCarmaViewPitchRad(pitchRad)) as Radians;

export const isCesiumPitchNearNadir = (
  pitchRad: Radians,
  threshold: Radians
): boolean => computeCesiumPitchDistanceFromNadir(pitchRad) <= threshold;
