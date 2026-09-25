import { offsetYearDay } from "@carma-commons/utils";
import type { Milliseconds } from "@carma-units";

import {
  SHADOW_ANIMATION_MODE,
  type ShadowDateState,
  type ShadowSimulationState,
} from "../contracts/shadow-simulation";
import {
  clampSelectionToDaylight,
  getDaylightWindow,
  type SolarLocation,
} from "./solar-position";

export type ShadowAnimationFrame = Readonly<{
  dateState: ShadowDateState;
  yearDayProgress: number;
}>;

type ShadowAnimationState = Pick<
  ShadowSimulationState,
  "animationMode" | "animationSpeed" | "enabled" | "isAnimating"
>;

const advanceYearSelection = (
  dateState: ShadowDateState,
  animationSpeed: number,
  location: SolarLocation,
  yearDayProgress: number
): ShadowAnimationFrame => {
  const accumulatedDays = yearDayProgress + animationSpeed / 2;
  const wholeDays = Math.floor(accumulatedDays);
  const remainingProgress = accumulatedDays - wholeDays;

  if (wholeDays === 0) {
    return { dateState, yearDayProgress: remainingProgress };
  }

  const nextYearDay = offsetYearDay(dateState, wholeDays);
  const nextDateState = clampSelectionToDaylight(
    { ...dateState, ...nextYearDay },
    location
  );

  return {
    dateState: nextDateState ?? dateState,
    yearDayProgress: remainingProgress,
  };
};

const advanceDaySelection = (
  dateState: ShadowDateState,
  animationSpeed: number,
  location: SolarLocation,
  preserveRemainder: boolean
): ShadowAnimationFrame => {
  const daylight = getDaylightWindow(dateState, location);
  const firstDaylightMinute = Math.ceil(daylight.sunriseMinutes);
  const lastDaylightMinute = Math.floor(daylight.sunsetMinutes);
  const nextMinute = dateState.minutes + animationSpeed;

  return {
    dateState: {
      ...dateState,
      minutes:
        nextMinute > lastDaylightMinute
          ? firstDaylightMinute +
            (preserveRemainder
              ? (nextMinute - firstDaylightMinute) %
                Math.max(1, lastDaylightMinute - firstDaylightMinute)
              : 0)
          : nextMinute,
    },
    yearDayProgress: 0,
  };
};

export const advanceShadowAnimationFrame = (
  shadowState: ShadowAnimationState | null | undefined,
  dateState: ShadowDateState | null | undefined,
  initialDateState: ShadowDateState,
  location: SolarLocation,
  yearDayProgress: number,
  options: Readonly<{ elapsedMs?: Milliseconds }> = {}
): ShadowAnimationFrame => {
  const currentDateState = dateState ?? initialDateState;
  if (!shadowState?.enabled || !shadowState.isAnimating) {
    return { dateState: currentDateState, yearDayProgress };
  }

  // Realtime 1× advances one simulated hour per wall-clock second. Omitted
  // elapsed time retains the normal addon's existing per-tick contract.
  const animationSpeed =
    (shadowState.animationSpeed ?? 4) *
    (options.elapsedMs === undefined
      ? 1
      : (Math.max(0, options.elapsedMs) * 60) / 1000);
  return (shadowState.animationMode ?? SHADOW_ANIMATION_MODE.DAY) ===
    SHADOW_ANIMATION_MODE.YEAR
    ? advanceYearSelection(
        currentDateState,
        animationSpeed,
        location,
        yearDayProgress
      )
    : advanceDaySelection(
        currentDateState,
        animationSpeed,
        location,
        options.elapsedMs !== undefined
      );
};
