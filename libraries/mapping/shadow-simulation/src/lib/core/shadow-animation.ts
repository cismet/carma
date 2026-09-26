import { getDaysInYear, offsetYearDay } from "@carma-commons/utils";
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
  | "animationMode"
  | "animationSpeed"
  | "animationCycleSeconds"
  | "animationDaylightOnly"
  | "enabled"
  | "isAnimating"
>;

const advanceYearSelection = (
  dateState: ShadowDateState,
  days: number,
  location: SolarLocation,
  yearDayProgress: number,
  realtime: boolean
): ShadowAnimationFrame => {
  const accumulatedDays = yearDayProgress + days;
  const wholeDays = Math.floor(accumulatedDays);
  const remainingProgress = accumulatedDays - wholeDays;

  if (wholeDays === 0) {
    return { dateState, yearDayProgress: remainingProgress };
  }

  const nextYearDay = realtime
    ? {
        year: dateState.year,
        dayOfYear:
          ((dateState.dayOfYear - 1 + wholeDays) %
            getDaysInYear(dateState.year)) +
          1,
      }
    : offsetYearDay(dateState, wholeDays);
  const nextDateState = realtime
    ? { ...dateState, ...nextYearDay }
    : clampSelectionToDaylight({ ...dateState, ...nextYearDay }, location);

  return {
    dateState: nextDateState ?? dateState,
    yearDayProgress: remainingProgress,
  };
};

const advanceDaySelection = (
  dateState: ShadowDateState,
  animationSpeed: number,
  location: SolarLocation,
  preserveRemainder: boolean,
  daylightOnly: boolean
): ShadowAnimationFrame => {
  if (!daylightOnly) {
    return {
      dateState: {
        ...dateState,
        minutes: (dateState.minutes + animationSpeed) % 1440,
      },
      yearDayProgress: 0,
    };
  }
  const daylight = getDaylightWindow(dateState, location);
  const firstDaylightMinute = Math.ceil(daylight.sunriseMinutes);
  const lastDaylightMinute = Math.floor(daylight.sunsetMinutes);
  const baseMinute =
    preserveRemainder &&
    (dateState.minutes < firstDaylightMinute ||
      dateState.minutes > lastDaylightMinute)
      ? firstDaylightMinute
      : dateState.minutes;
  const nextMinute = baseMinute + animationSpeed;

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

  const realtime = options.elapsedMs !== undefined;
  const yearMode =
    (shadowState.animationMode ?? SHADOW_ANIMATION_MODE.DAY) ===
    SHADOW_ANIMATION_MODE.YEAR;
  const daylightOnly = shadowState.animationDaylightOnly !== false;
  const cycleSeconds = shadowState.animationCycleSeconds;

  // A cycle length: the share of one pass the elapsed time stands for, of a
  // year, of the daylight window, or of all 24 hours.
  if (realtime && cycleSeconds !== undefined && cycleSeconds > 0) {
    const share = Math.max(0, options.elapsedMs ?? 0) / (cycleSeconds * 1000);
    if (yearMode) {
      return advanceYearSelection(
        currentDateState,
        share * getDaysInYear(currentDateState.year),
        location,
        yearDayProgress,
        true
      );
    }
    const daylight = getDaylightWindow(currentDateState, location);
    const passMinutes = daylightOnly
      ? Math.max(1, daylight.sunsetMinutes - daylight.sunriseMinutes)
      : 1440;
    return advanceDaySelection(
      currentDateState,
      share * passMinutes,
      location,
      true,
      daylightOnly
    );
  }

  // Realtime 1× advances one hour/s in day mode; the default 4× advances
  // 60 days/s in year mode (one day/frame at 60 Hz). Without elapsed time,
  // retain the normal addon's existing per-tick contract.
  const animationSpeed =
    (shadowState.animationSpeed ?? 4) *
    (realtime ? (Math.max(0, options.elapsedMs ?? 0) * 60) / 1000 : 1);
  return yearMode
    ? advanceYearSelection(
        currentDateState,
        animationSpeed / (realtime ? 4 : 2),
        location,
        yearDayProgress,
        realtime
      )
    : advanceDaySelection(
        currentDateState,
        animationSpeed,
        location,
        realtime,
        daylightOnly
      );
};
