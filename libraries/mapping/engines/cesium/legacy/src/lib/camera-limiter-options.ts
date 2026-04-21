import { degToRadNumeric, type Radians } from "@carma-units";

export type CameraLimiterOptions = {
  pitchLimiter?: boolean;
  minPitchDeg?: number;
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

const clampMinPitchDeg = (minPitchDeg: number): number =>
  Math.min(Math.max(minPitchDeg, 0), 90);

const clampMinPitchRangeDeg = (
  minPitchRangeDeg: number,
  minPitchDeg: number
): number => Math.min(Math.max(minPitchRangeDeg, 0), 90 - minPitchDeg);

export const resolveCameraLimiterOptions = (
  options: CameraLimiterOptions = {}
): ResolvedCameraLimiterOptions => {
  const minPitchDeg = clampMinPitchDeg(
    options.minPitchDeg ?? DEFAULT_CAMERA_LIMITER_OPTIONS.minPitchDeg
  );
  const minPitchRangeDeg = clampMinPitchRangeDeg(
    options.minPitchRangeDeg ?? DEFAULT_CAMERA_LIMITER_OPTIONS.minPitchRangeDeg,
    minPitchDeg
  );

  return {
    pitchLimiter:
      options.pitchLimiter ?? DEFAULT_CAMERA_LIMITER_OPTIONS.pitchLimiter,
    minPitch: degToRadNumeric(-minPitchDeg)! as Radians,
    minPitchRange: degToRadNumeric(minPitchRangeDeg)! as Radians,
  };
};
