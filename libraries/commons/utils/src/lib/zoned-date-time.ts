import { Temporal as TemporalPolyfill } from "@js-temporal/polyfill";

import type { ZonedYearDayTime } from "./calendar";

type TemporalApi = typeof TemporalPolyfill;

const nativeTemporal = (
  globalThis as typeof globalThis & { Temporal?: TemporalApi }
).Temporal;

// Prefer the standardized browser API and provide the same API on browsers
// that have not shipped Temporal yet. Do not install globals from the polyfill.
const Temporal = nativeTemporal ?? TemporalPolyfill;

const toPlainDate = ({ year, dayOfYear }: ZonedYearDayTime) =>
  Temporal.PlainDate.from({ year, month: 1, day: 1 }).add({
    days: dayOfYear - 1,
  });

const toZonedDateTime = (value: ZonedYearDayTime) => {
  const date = toPlainDate(value);
  const minutes = Math.round(value.minutes);

  return Temporal.ZonedDateTime.from(
    {
      timeZone: value.timeZone,
      year: date.year,
      month: date.month,
      day: date.day,
      hour: Math.floor(minutes / 60),
      minute: minutes % 60,
    },
    { disambiguation: "compatible" }
  );
};

export const instantToZonedYearDayTime = (
  instant: Date,
  timeZone: string
): ZonedYearDayTime => {
  const zonedDateTime = Temporal.Instant.fromEpochMilliseconds(
    instant.getTime()
  ).toZonedDateTimeISO(timeZone);

  return {
    year: zonedDateTime.year,
    dayOfYear: zonedDateTime.dayOfYear,
    minutes: zonedDateTime.hour * 60 + zonedDateTime.minute,
    timeZone: zonedDateTime.timeZoneId,
  };
};

export const zonedYearDayTimeToInstant = (
  value: ZonedYearDayTime
): Date => new Date(toZonedDateTime(value).epochMilliseconds);

export const getZonedUtcOffsetMinutes = (
  value: ZonedYearDayTime
): number => toZonedDateTime(value).offsetNanoseconds / 60_000_000_000;
