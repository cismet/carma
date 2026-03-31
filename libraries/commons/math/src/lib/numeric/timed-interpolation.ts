import { LINEAR_NONE } from "../easing-functions";
import type { Easing } from "../easing-functions";
import { clamp } from "./clamp";
import { isFiniteNumber } from "./is-finite-number";
import { lerp } from "./lerp";
export type TimedInterpolationOptions = {
  startedAtMs: number;
  durationMs: number;
  nowMs: number;
};

export const readTimedInterpolationProgress = ({
  startedAtMs,
  durationMs,
  nowMs,
}: TimedInterpolationOptions): number | null => {
  if (
    !isFiniteNumber(startedAtMs) ||
    !isFiniteNumber(durationMs) ||
    !isFiniteNumber(nowMs) ||
    durationMs < 0
  ) {
    return null;
  }

  if (durationMs === 0) {
    return 1;
  }

  return clamp((nowMs - startedAtMs) / durationMs, 0, 1);
};

export const readTimedInterpolationEasedProgress = ({
  startedAtMs,
  durationMs,
  nowMs,
  easing = LINEAR_NONE,
}: TimedInterpolationOptions & {
  easing?: Easing;
}): number | null => {
  const progress = readTimedInterpolationProgress({
    startedAtMs,
    durationMs,
    nowMs,
  });
  if (progress === null) {
    return null;
  }

  const easedProgress = easing(progress);
  return isFiniteNumber(easedProgress) ? clamp(easedProgress, 0, 1) : null;
};

export const interpolateTimedNumber = ({
  start,
  target,
  startedAtMs,
  durationMs,
  nowMs,
  easing = LINEAR_NONE,
}: TimedInterpolationOptions & {
  start: number;
  target: number;
  easing?: Easing;
}): number | null => {
  if (!isFiniteNumber(start) || !isFiniteNumber(target)) {
    return null;
  }

  const easedProgress = readTimedInterpolationEasedProgress({
    startedAtMs,
    durationMs,
    nowMs,
    easing,
  });
  return easedProgress === null ? null : lerp(start, target, easedProgress);
};
