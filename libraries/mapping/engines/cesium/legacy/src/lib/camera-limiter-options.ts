import { fromCarmaViewPitchDegToCesiumPitchRad } from "@carma-commons/camera/model";
import { clamp, isFiniteNumber } from "@carma-commons/math";
import { degToRadNumeric, type Radians } from "@carma-units";

export type CameraLimiterOptions = {
  pitchLimiter?: boolean;
  /** CARMA view pitch convention: 0 = nadir, 90 = horizon. */
  minPitchDeg?: number;
  /** Degrees to ease/reset back toward nadir from minPitchDeg. */
  minPitchRangeDeg?: number;
};

export type ResolvedCameraLimiterOptions = {
  pitchLimiter: boolean;
  minPitch: Radians;
  minPitchRange: Radians;
};

export const DEFAULT_CAMERA_LIMITER_OPTIONS = Object.freeze({
  pitchLimiter: true,
  minPitchDeg: 15,
  minPitchRangeDeg: 10,
} satisfies Required<CameraLimiterOptions>);

const computeMaxMinPitchRangeDeg = (minPitchDeg: number): number => minPitchDeg;

const computeMinPitch = (minPitchDeg: number): Radians =>
  fromCarmaViewPitchDegToCesiumPitchRad(minPitchDeg)!;

const computeMinPitchRange = (minPitchRangeDeg: number): Radians =>
  degToRadNumeric(minPitchRangeDeg)! as Radians;

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

export const resolveCameraLimiterOptions = (
  options: CameraLimiterOptions = {}
): ResolvedCameraLimiterOptions => {
  const pitchLimiter = readCameraLimiterBoolean({
    key: "pitchLimiter",
    value: options.pitchLimiter,
    defaultValue: DEFAULT_CAMERA_LIMITER_OPTIONS.pitchLimiter,
  });
  const minPitchDeg = readClampedCameraLimiterNumber({
    key: "minPitchDeg",
    value: options.minPitchDeg,
    defaultValue: DEFAULT_CAMERA_LIMITER_OPTIONS.minPitchDeg,
    min: 0,
    max: 90,
  });
  const maxMinPitchRangeDeg = computeMaxMinPitchRangeDeg(minPitchDeg);
  const minPitchRangeDeg = readClampedCameraLimiterNumber({
    key: "minPitchRangeDeg",
    value: options.minPitchRangeDeg,
    defaultValue: DEFAULT_CAMERA_LIMITER_OPTIONS.minPitchRangeDeg,
    min: 0,
    max: maxMinPitchRangeDeg,
  });
  const minPitch = computeMinPitch(minPitchDeg);
  const minPitchRange = computeMinPitchRange(minPitchRangeDeg);

  return {
    pitchLimiter,
    minPitch,
    minPitchRange,
  };
};
