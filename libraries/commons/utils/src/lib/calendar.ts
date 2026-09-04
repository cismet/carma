export type YearDay = {
  year: number;
  dayOfYear: number;
};

export type YearDayTime = YearDay & {
  minutes: number;
};

export type ZonedYearDayTime = YearDayTime & {
  timeZone: string;
};

const MILLISECONDS_PER_DAY = 86_400_000;

export const getDaysInYear = (year: number): number =>
  new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1 ? 366 : 365;

export const getDayOfYear = (
  year: number,
  zeroBasedMonth: number,
  day: number
): number =>
  Math.floor(
    (Date.UTC(year, zeroBasedMonth, day) - Date.UTC(year, 0, 1)) /
      MILLISECONDS_PER_DAY
  ) + 1;

export const getUtcDateForDayOfYear = (
  year: number,
  dayOfYear: number
): Date => new Date(Date.UTC(year, 0, dayOfYear));

export const offsetYearDay = (
  value: YearDay,
  dayOffset: number
): YearDay => {
  const date = getUtcDateForDayOfYear(
    value.year,
    value.dayOfYear + dayOffset
  );
  return {
    year: date.getUTCFullYear(),
    dayOfYear: getDayOfYear(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    ),
  };
};
