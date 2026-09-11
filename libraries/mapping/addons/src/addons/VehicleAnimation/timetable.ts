/**
 * A published timetable for one line, as `build-schwebebahn-timetable.mjs`
 * writes it from a GTFS feed: the stations in line order, the service
 * calendar, and every trip as its departure time at each station.
 *
 * Framework-agnostic like `track.ts`. The fleet that runs it lives in
 * `timetable-fleet.ts`; this file only knows what the asset looks like and
 * what day and second a moment in time falls on in the line's own timezone.
 */

export type TimetableStation = {
  /** the stop's global id, e.g. a DHID */
  id: string;
  name: string;
  lon: number;
  lat: number;
};

export type TimetableService = {
  /** Monday to Sunday, 1 where the service runs */
  days: number[];
  /** first and last day, as YYYYMMDD */
  start: string;
  end: string;
  /** days added to and taken out of that pattern, as YYYYMMDD */
  added: string[];
  removed: string[];
};

export type TimetableTrip = {
  service: string;
  /** `forward` runs the stations in listed order, `backward` the other way */
  direction: "forward" | "backward";
  /**
   * Departure at each station, in seconds after midnight of the service day,
   * one entry per station in listed order; null where the trip does not call.
   * Departures after midnight run past 86400, the way GTFS writes them.
   */
  times: (number | null)[];
};

export type Timetable = {
  name: string;
  /** IANA name, e.g. Europe/Berlin: the zone the times are written in */
  timezone: string;
  /** first and last day the feed covers, as YYYYMMDD; empty when unknown */
  validFrom: string;
  validTo: string;
  stations: TimetableStation[];
  services: Record<string, TimetableService>;
  trips: TimetableTrip[];
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const isStation = (value: unknown): value is TimetableStation => {
  if (typeof value !== "object" || value === null) return false;
  const { id, name, lon, lat } = value as Record<string, unknown>;
  return (
    typeof id === "string" &&
    typeof name === "string" &&
    typeof lon === "number" &&
    typeof lat === "number"
  );
};

const isService = (value: unknown): value is TimetableService => {
  if (typeof value !== "object" || value === null) return false;
  const { days, start, end, added, removed } = value as Record<string, unknown>;
  return (
    Array.isArray(days) &&
    days.length === 7 &&
    days.every((day) => day === 0 || day === 1) &&
    typeof start === "string" &&
    typeof end === "string" &&
    isStringArray(added) &&
    isStringArray(removed)
  );
};

const isTrip = (value: unknown, stationCount: number): value is TimetableTrip => {
  if (typeof value !== "object" || value === null) return false;
  const { service, direction, times } = value as Record<string, unknown>;
  return (
    typeof service === "string" &&
    (direction === "forward" || direction === "backward") &&
    Array.isArray(times) &&
    times.length === stationCount &&
    times.every((time) => time === null || typeof time === "number")
  );
};

/** the asset as parsed JSON, or null when it is not one */
export const parseTimetable = (value: unknown): Timetable | null => {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.type !== "VehicleTimetable") return null;
  const { name, timezone, validFrom, validTo, stations, services, trips } = record;
  if (
    typeof name !== "string" ||
    typeof timezone !== "string" ||
    !Array.isArray(stations) ||
    !stations.every(isStation) ||
    typeof services !== "object" ||
    services === null ||
    !Object.values(services).every(isService) ||
    !Array.isArray(trips) ||
    !trips.every((trip) => isTrip(trip, stations.length))
  ) {
    return null;
  }
  return {
    name,
    timezone,
    validFrom: typeof validFrom === "string" ? validFrom : "",
    validTo: typeof validTo === "string" ? validTo : "",
    stations,
    services: services as Record<string, TimetableService>,
    trips,
  };
};

/**
 * Whether `service` runs on `day` (YYYYMMDD), whose weekday is `weekday`
 * (0 = Monday). Exception days win over the weekly pattern, as in GTFS.
 */
export const serviceRunsOn = (
  service: TimetableService,
  day: string,
  weekday: number
): boolean => {
  if (service.removed.includes(day)) return false;
  if (service.added.includes(day)) return true;
  if (day < service.start || day > service.end) return false;
  return service.days[weekday] === 1;
};

/** a moment as the timetable sees it */
export type ZonedMoment = {
  /** YYYYMMDD */
  day: string;
  /** 0 = Monday */
  weekday: number;
  /** seconds after that day's midnight, with their fraction */
  seconds: number;
};

const WEEKDAYS: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

const formatters = new Map<string, Intl.DateTimeFormat | null>();

/** a formatter for the zone, or null when the runtime does not know it */
const formatterFor = (timezone: string): Intl.DateTimeFormat | null => {
  const cached = formatters.get(timezone);
  if (cached !== undefined) return cached;
  let formatter: Intl.DateTimeFormat | null = null;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    console.warn(`[VEHICLE ANIMATION] unknown timezone ${timezone}, using local time`);
  }
  formatters.set(timezone, formatter);
  return formatter;
};

const pad = (value: number): string => String(value).padStart(2, "0");

/**
 * The day and second `epochMs` falls on in `timezone`. Falls back to the
 * browser's own zone when the name is unknown to it.
 *
 * The seconds carry their fraction: the formatter only knows whole seconds,
 * and a fleet placed from whole seconds moves in one-second hops.
 */
export const zonedMoment = (timezone: string, epochMs: number): ZonedMoment => {
  const fraction = (((epochMs % 1000) + 1000) % 1000) / 1000;
  const formatter = formatterFor(timezone);
  if (formatter) {
    const parts: Record<string, string> = {};
    for (const { type, value } of formatter.formatToParts(new Date(epochMs))) {
      parts[type] = value;
    }
    return {
      day: `${parts.year}${parts.month}${parts.day}`,
      weekday: WEEKDAYS[parts.weekday] ?? 0,
      seconds:
        Number(parts.hour) * 3600 +
        Number(parts.minute) * 60 +
        Number(parts.second) +
        fraction,
    };
  }
  const date = new Date(epochMs);
  return {
    day: `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`,
    weekday: (date.getDay() + 6) % 7,
    seconds:
      date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() + fraction,
  };
};

/**
 * `zonedMoment` for a clock that is read on every animation frame.
 *
 * The formatter is what costs, so it runs once a minute. Every zone in use
 * today is a whole number of minutes off UTC, so a new day, weekday or a
 * daylight saving switch can only begin on a UTC minute, and the seconds
 * within one minute follow from the epoch alone.
 */
export const createZonedClock = (
  timezone: string
): ((epochMs: number) => ZonedMoment) => {
  let minuteStart = Number.NaN;
  let atMinute: ZonedMoment | null = null;
  return (epochMs) => {
    const minute = Math.floor(epochMs / 60000) * 60000;
    if (atMinute === null || minute !== minuteStart) {
      atMinute = zonedMoment(timezone, minute);
      minuteStart = minute;
    }
    return {
      day: atMinute.day,
      weekday: atMinute.weekday,
      seconds: atMinute.seconds + (epochMs - minute) / 1000,
    };
  };
};

/** `day` (YYYYMMDD) moved by `days`, with its new weekday */
export const shiftDay = (
  day: string,
  weekday: number,
  days: number
): { day: string; weekday: number } => {
  const utc = Date.UTC(
    Number(day.slice(0, 4)),
    Number(day.slice(4, 6)) - 1,
    Number(day.slice(6, 8)) + days
  );
  const date = new Date(utc);
  return {
    day: `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`,
    weekday: (((weekday + days) % 7) + 7) % 7,
  };
};
