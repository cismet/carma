/**
 * How long one pass of the shadow playback takes: a day, its daylight window,
 * or a year. The steps grow with the length, so the short end is fine enough
 * to tune and the long end still reaches a slow walk through the day.
 */
export const SHADOW_CYCLE_STEPS_SECONDS = [
  10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300,
] as const;

export const DEFAULT_SHADOW_CYCLE_SECONDS = 60;

/** the step nearest to `seconds`, as an index into the steps */
export const shadowCycleStepIndex = (seconds: number): number => {
  let nearest = 0;
  SHADOW_CYCLE_STEPS_SECONDS.forEach((step, index) => {
    if (
      Math.abs(step - seconds) <
      Math.abs(SHADOW_CYCLE_STEPS_SECONDS[nearest] - seconds)
    ) {
      nearest = index;
    }
  });
  return nearest;
};

/** "45 s", "1 min", "1,5 min" */
export const formatShadowCycle = (seconds: number): string =>
  seconds < 60
    ? `${seconds} s`
    : `${(seconds / 60).toLocaleString("de-DE", {
        maximumFractionDigits: 1,
      })} min`;
