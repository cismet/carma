import { fromCarmaViewPitchDegToCesiumPitchRad } from "@carma-commons/camera/model";
import { clamp, isFiniteNumber } from "@carma-commons/math";
import { degToRadNumeric, type Radians } from "@carma-units";

export type CameraLimiterOptions = {
  pitchLimiter?: boolean;
  /** Maximum allowed CARMA-view pitch in degrees: 0 = nadir, 90 = horizon. */
  maxPitchDeg?: number;
  /**
   * CARMA-view degree band below maxPitchDeg where limiter correction toward
   * nadir starts.
   */
  maxPitchCorrectionRangeDeg?: number;
};

export type ResolvedCameraLimiterOptions = {
  pitchLimiter: boolean;
  minCesiumPitch: Radians;
  pitchCorrectionRange: Radians;
};

export const DEFAULT_CAMERA_LIMITER_OPTIONS = Object.freeze({
  pitchLimiter: true,
  maxPitchDeg: 75,
  maxPitchCorrectionRangeDeg: 10,
} satisfies Required<CameraLimiterOptions>);

const computeMaxSupportedPitchCorrectionRangeDeg = (
  maxPitchDeg: number
): number => maxPitchDeg;

const computeMinCesiumPitch = (maxPitchDeg: number): Radians =>
  fromCarmaViewPitchDegToCesiumPitchRad(maxPitchDeg)!;

const computePitchCorrectionRange = (
  maxPitchCorrectionRangeDeg: number
): Radians => degToRadNumeric(maxPitchCorrectionRangeDeg)! as Radians;

const warnedCameraLimiterWarnings = new Set<string>();

const warnCameraLimiterOptionOnce = ({
  key,
  issue,
  received,
  applied,
}: {
  key: keyof CameraLimiterOptions;
  issue: string;
  received: unknown;
  applied: boolean | number;
}) => {
  const warningKey = `${key}:${issue}:${String(received)}:${String(applied)}`;
  if (warnedCameraLimiterWarnings.has(warningKey)) {
    return;
  }

  warnedCameraLimiterWarnings.add(warningKey);
  console.warn("[CESIUM|CAMERA] Invalid camera limiter option", {
    key,
    issue,
    received,
    applied,
  });
};

const readCameraLimiterBoolean = ({
  key,
  value,
  defaultValue,
}: {
  key: keyof CameraLimiterOptions;
  value: unknown;
  defaultValue: boolean;
}): boolean => {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "boolean") {
    warnCameraLimiterOptionOnce({
      key,
      issue: "expected boolean",
      received: value,
      applied: defaultValue,
    });
    return defaultValue;
  }

  return value;
};

const readClampedCameraLimiterNumber = ({
  key,
  value,
  defaultValue,
  min,
  max,
}: {
  key: keyof CameraLimiterOptions;
  value: unknown;
  defaultValue: number;
  min: number;
  max: number;
}): number => {
  const hasUserValue = value !== undefined;
  const hasFiniteUserValue = isFiniteNumber(value);
  const rawValue = hasUserValue
    ? hasFiniteUserValue
      ? value
      : defaultValue
    : defaultValue;

  if (hasUserValue && !hasFiniteUserValue) {
    warnCameraLimiterOptionOnce({
      key,
      issue: "expected finite number",
      received: value,
      applied: defaultValue,
    });
  }

  const clampedValue = clamp(rawValue, min, max);
  if (hasFiniteUserValue && clampedValue !== rawValue) {
    warnCameraLimiterOptionOnce({
      key,
      issue: `clamped to ${min}..${max}`,
      received: value,
      applied: clampedValue,
    });
  }

  return clampedValue;
};

/**
 * Reads the public CARMA-view limiter options in degrees and resolves them to
 * Cesium-native runtime values in radians.
 */
export const resolveCameraLimiterOptions = (
  options: CameraLimiterOptions = {}
): ResolvedCameraLimiterOptions => {
  const pitchLimiter = readCameraLimiterBoolean({
    key: "pitchLimiter",
    value: options.pitchLimiter,
    defaultValue: DEFAULT_CAMERA_LIMITER_OPTIONS.pitchLimiter,
  });
  const maxPitchDeg = readClampedCameraLimiterNumber({
    key: "maxPitchDeg",
    value: options.maxPitchDeg,
    defaultValue: DEFAULT_CAMERA_LIMITER_OPTIONS.maxPitchDeg,
    min: 0,
    max: 90,
  });
  const maxSupportedPitchCorrectionRangeDeg =
    computeMaxSupportedPitchCorrectionRangeDeg(maxPitchDeg);
  const pitchCorrectionRangeDeg = readClampedCameraLimiterNumber({
    key: "maxPitchCorrectionRangeDeg",
    value: options.maxPitchCorrectionRangeDeg,
    defaultValue: DEFAULT_CAMERA_LIMITER_OPTIONS.maxPitchCorrectionRangeDeg,
    min: 0,
    max: maxSupportedPitchCorrectionRangeDeg,
  });
  const minCesiumPitch = computeMinCesiumPitch(maxPitchDeg);
  const pitchCorrectionRange = computePitchCorrectionRange(
    pitchCorrectionRangeDeg
  );

  return {
    pitchLimiter,
    minCesiumPitch,
    pitchCorrectionRange,
  };
};
