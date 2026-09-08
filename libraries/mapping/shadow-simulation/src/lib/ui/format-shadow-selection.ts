import { getDayOfYear, getUtcDateForDayOfYear } from "@carma-commons/utils";
import type { SolarSelection } from "../core/solar-position";

const shortDayFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});
const monthFormatter = new Intl.DateTimeFormat("de-DE", {
  month: "short",
  timeZone: "UTC",
});

export const formatSolarDay = (year: number, dayOfYear: number): string =>
  shortDayFormatter.format(getUtcDateForDayOfYear(year, dayOfYear));

export const getSolarMonthTicks = (year: number) =>
  Array.from({ length: 12 }, (_, month) => {
    const dayOfYear = getDayOfYear(year, month, 1);
    return {
      dayOfYear,
      label: monthFormatter.format(getUtcDateForDayOfYear(year, dayOfYear)),
    };
  });

export const formatClockMinutes = (minutes: number): string => {
  const roundedMinutes = Math.round(minutes);
  const hours = String(Math.floor(roundedMinutes / 60)).padStart(2, "0");
  const minutePart = String(roundedMinutes % 60).padStart(2, "0");
  return `${hours}:${minutePart}`;
};

export const formatSolarSelectionDate = (
  selection: Pick<SolarSelection, "year" | "dayOfYear">,
  includeYear = true
): string =>
  new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "long",
    ...(includeYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(Date.UTC(selection.year, 0, selection.dayOfYear)));

export const formatShadowSelection = (
  selection: Pick<SolarSelection, "year" | "dayOfYear" | "minutes">
): string => {
  const date = new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(selection.year, 0, selection.dayOfYear)));
  return `${date} · ${formatClockMinutes(selection.minutes)}`;
};
