import { fromCarmaViewPitchDegToCesiumPitchRad } from "@carma-commons/camera/model";
import {
  clamp,
  Easing,
  isFiniteNumber,
  type Easing as EasingFunction,
} from "@carma-commons/math";
import { degToRadNumeric, type Radians } from "@carma-units";

export type CameraPitchLimiterOptions = {
  enabled?: boolean;
  /**
   * Maximum allowed CARMA-view pitch in degrees: 0 = nadir, 90 = horizon.
   */
  max?: number;
  /**
   * CARMA-view degree band below `max` where limiter correction toward nadir
   * starts.
   */
  maxCorrectionRange?: number;
};

export type CameraLimiterReenableTransitionOptions = {
  pitch: {
    durationSeconds: number;
  };
  travelZoom: {
    durationMilliseconds: number;
    easing: EasingFunction;
  };
};

export type CameraLimiterTransitionsOptions = {
  reenable?: CameraLimiterReenableTransitionOptions;
};

export type CameraLimiterConfig = {
  pitch?: CameraPitchLimiterOptions;
  transitions?: CameraLimiterTransitionsOptions;
};

export type CameraLimiterOptions = {
  limiter?: CameraLimiterConfig;
};

export type ResolvedCameraPitchLimiterOptions = {
  enabled: boolean;
  max: number;
  maxCorrectionRange: number;
  minCesiumPitch: Radians;
  correctionRange: Radians;
};

export type ResolvedCameraLimiterOptions = {
  limiter: {
    pitch: ResolvedCameraPitchLimiterOptions;
  };
};

type RequiredCameraLimiterOptions = {
  limiter: {
    pitch: Required<CameraPitchLimiterOptions>;
    transitions: {
      reenable: CameraLimiterReenableTransitionOptions;
    };
  };
};

export const DEFAULT_CAMERA_LIMITER_OPTIONS = Object.freeze({
  limiter: {
    pitch: {
      enabled: true,
      max: 75,
      maxCorrectionRange: 10,
    },
    transitions: {
      reenable: {
        pitch: {
          durationSeconds: 0.8,
        },
        travelZoom: {
          durationMilliseconds: 1500,
          easing: Easing.CUBIC_IN_OUT,
        },
      },
    },
  },
} satisfies RequiredCameraLimiterOptions);

type CameraLimiterWarningKey =
  | "limiter.pitch.enabled"
  | "limiter.pitch.max"
  | "limiter.pitch.maxCorrectionRange";

const computeMaxSupportedPitchCorrectionRangeDeg = (maxPitch: number): number =>
  maxPitch;

const computeMinCesiumPitch = (maxPitch: number): Radians =>
  fromCarmaViewPitchDegToCesiumPitchRad(maxPitch)!;

const computePitchCorrectionRange = (
  maxPitchCorrectionRange: number
): Radians => degToRadNumeric(maxPitchCorrectionRange)! as Radians;

const warnedCameraLimiterWarnings = new Set<string>();

const warnCameraLimiterOptionOnce = ({
  key,
  issue,
  received,
  applied,
}: {
  key: CameraLimiterWarningKey;
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
  key: CameraLimiterWarningKey;
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
  key: CameraLimiterWarningKey;
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
  const pitchOptions = options.limiter?.pitch ?? {};
  const defaultPitchOptions = DEFAULT_CAMERA_LIMITER_OPTIONS.limiter.pitch;
  const enabled = readCameraLimiterBoolean({
    key: "limiter.pitch.enabled",
    value: pitchOptions.enabled,
    defaultValue: defaultPitchOptions.enabled,
  });
  const maxPitch = readClampedCameraLimiterNumber({
    key: "limiter.pitch.max",
    value: pitchOptions.max,
    defaultValue: defaultPitchOptions.max,
    min: 0,
    max: 90,
  });
  const maxSupportedPitchCorrectionRangeDeg =
    computeMaxSupportedPitchCorrectionRangeDeg(maxPitch);
  const maxPitchCorrectionRange = readClampedCameraLimiterNumber({
    key: "limiter.pitch.maxCorrectionRange",
    value: pitchOptions.maxCorrectionRange,
    defaultValue: defaultPitchOptions.maxCorrectionRange,
    min: 0,
    max: maxSupportedPitchCorrectionRangeDeg,
  });
  const minCesiumPitch = computeMinCesiumPitch(maxPitch);
  const pitchCorrectionRange = computePitchCorrectionRange(
    maxPitchCorrectionRange
  );

  return {
    limiter: {
      pitch: {
        enabled,
        max: maxPitch,
        maxCorrectionRange: maxPitchCorrectionRange,
        minCesiumPitch,
        correctionRange: pitchCorrectionRange,
      },
    },
  };
};
