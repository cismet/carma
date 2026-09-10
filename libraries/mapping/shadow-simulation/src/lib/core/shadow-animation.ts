import { offsetYearDay } from "@carma-commons/utils";

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
  location: SolarLocation
): ShadowAnimationFrame => {
  const daylight = getDaylightWindow(dateState, location);
  const firstDaylightMinute = Math.ceil(daylight.sunriseMinutes);
  const lastDaylightMinute = Math.floor(daylight.sunsetMinutes);
  const nextMinute = dateState.minutes + animationSpeed;

  return {
    dateState: {
      ...dateState,
      minutes:
        nextMinute > lastDaylightMinute ? firstDaylightMinute : nextMinute,
    },
    yearDayProgress: 0,
  };
};

export const advanceShadowAnimationFrame = (
  shadowState: ShadowAnimationState | null | undefined,
  dateState: ShadowDateState | null | undefined,
  initialDateState: ShadowDateState,
  location: SolarLocation,
  yearDayProgress: number
): ShadowAnimationFrame => {
  const currentDateState = dateState ?? initialDateState;
  if (!shadowState?.enabled || !shadowState.isAnimating) {
    return { dateState: currentDateState, yearDayProgress };
  }

  const animationSpeed = shadowState.animationSpeed ?? 4;
  return (shadowState.animationMode ?? SHADOW_ANIMATION_MODE.DAY) ===
    SHADOW_ANIMATION_MODE.YEAR
    ? advanceYearSelection(
        currentDateState,
        animationSpeed,
        location,
        yearDayProgress
      )
    : advanceDaySelection(currentDateState, animationSpeed, location);
};
