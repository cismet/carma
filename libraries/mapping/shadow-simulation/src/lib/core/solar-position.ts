import { clamp } from "@carma-commons/math";
import { degToRadNumeric, radToDegNumeric } from "@carma-units";

const MINUTES_PER_DAY = 24 * 60;

export const MEAN_SOLAR_ANGULAR_RADIUS_DEGREES = 0.2666;

export type SolarLocation = {
  latitude: number;
  longitude: number;
  timeZone: string;
};

export const DEFAULT_SHADOW_SIMULATION_LOCATION: SolarLocation = {
  latitude: 51.256,
  longitude: 7.15,
  timeZone: "Europe/Berlin",
};

export type SolarSelection = {
  year: number;
  dayOfYear: number;
  minutes: number;
};

export type DaylightWindow = {
  sunriseMinutes: number;
  solarNoonMinutes: number;
  sunsetMinutes: number;
  polarDay: boolean;
  polarNight: boolean;
};

export type SolarPosition = {
  instant: Date;
  azimuthDegrees: number;
  elevationDegrees: number;
};

const normalizeMinutes = (minutes: number) =>
  ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

export const getDaysInYear = (year: number): number =>
  new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1 ? 366 : 365;

const getDatePartsForDayOfYear = (year: number, dayOfYear: number) => {
  const date = new Date(
    Date.UTC(year, 0, clamp(Math.round(dayOfYear), 1, getDaysInYear(year)))
  );
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const getTimeZoneFormatter = (timeZone: string) => {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
};

const getZonedParts = (instant: Date, timeZone: string) => {
  const values = Object.fromEntries(
    getTimeZoneFormatter(timeZone)
      .formatToParts(instant)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, Number(value)])
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
};

const getTimeZoneOffsetMinutes = (instant: Date, timeZone: string): number => {
  const parts = getZonedParts(instant, timeZone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return Math.round((representedAsUtc - instant.getTime()) / 60_000);
};

export const solarSelectionToInstant = (
  selection: SolarSelection,
  timeZone: string
): Date => {
  const date = getDatePartsForDayOfYear(selection.year, selection.dayOfYear);
  const safeMinutes = clamp(
    Math.round(selection.minutes),
    0,
    MINUTES_PER_DAY - 1
  );
  const hour = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;
  const wallClockUtc = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    hour,
    minute
  );
  let instantMs = wallClockUtc;

  // Resolve the local wall-clock time against the named IANA zone. Iterating
  // handles the offset changing between the initial UTC guess and local noon.
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(
      new Date(instantMs),
      timeZone
    );
    const nextInstantMs = wallClockUtc - offsetMinutes * 60_000;
    if (nextInstantMs === instantMs) break;
    instantMs = nextInstantMs;
  }
  return new Date(instantMs);
};

export const getSolarSelectionForInstant = (
  instant: Date,
  timeZone: string
): SolarSelection => {
  const parts = getZonedParts(instant, timeZone);
  const dayOfYear =
    Math.floor(
      (Date.UTC(parts.year, parts.month - 1, parts.day) -
        Date.UTC(parts.year, 0, 1)) /
        86_400_000
    ) + 1;
  return {
    year: parts.year,
    dayOfYear,
    minutes: parts.hour * 60 + parts.minute,
  };
};

const getSolarTerms = (year: number, dayOfYear: number, minutes: number) => {
  const fractionalYear =
    ((2 * Math.PI) / getDaysInYear(year)) *
    (dayOfYear - 1 + (minutes - 720) / MINUTES_PER_DAY);
  const equationOfTimeMinutes =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(fractionalYear) -
      0.032077 * Math.sin(fractionalYear) -
      0.014615 * Math.cos(2 * fractionalYear) -
      0.040849 * Math.sin(2 * fractionalYear));
  const declinationRadians =
    0.006918 -
    0.399912 * Math.cos(fractionalYear) +
    0.070257 * Math.sin(fractionalYear) -
    0.006758 * Math.cos(2 * fractionalYear) +
    0.000907 * Math.sin(2 * fractionalYear) -
    0.002697 * Math.cos(3 * fractionalYear) +
    0.00148 * Math.sin(3 * fractionalYear);
  return { equationOfTimeMinutes, declinationRadians };
};

const getSelectableHourAngleCosine = (
  latitudeRadians: number,
  declinationRadians: number
) =>
  (Math.sin(degToRadNumeric(MEAN_SOLAR_ANGULAR_RADIUS_DEGREES)) -
    Math.sin(latitudeRadians) * Math.sin(declinationRadians)) /
  (Math.cos(latitudeRadians) * Math.cos(declinationRadians));

const resolveDaylightBoundaryMinutes = (
  year: number,
  dayOfYear: number,
  location: SolarLocation,
  timeZoneOffsetHours: number,
  initialMinutes: number,
  direction: -1 | 1
) => {
  let boundaryMinutes = initialMinutes;
  const latitudeRadians = degToRadNumeric(location.latitude);

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const { equationOfTimeMinutes, declinationRadians } = getSolarTerms(
      year,
      dayOfYear,
      boundaryMinutes
    );
    const hourAngleDegrees = radToDegNumeric(
      Math.acos(
        clamp(
          getSelectableHourAngleCosine(latitudeRadians, declinationRadians),
          -1,
          1
        )
      )
    );
    const solarNoonMinutes =
      720 -
      4 * location.longitude -
      equationOfTimeMinutes +
      60 * timeZoneOffsetHours;
    boundaryMinutes = solarNoonMinutes + direction * 4 * hourAngleDegrees;
  }

  return boundaryMinutes;
};

export const getDaylightWindow = (
  year: number,
  dayOfYear: number,
  location: SolarLocation
): DaylightWindow => {
  const safeDay = clamp(Math.round(dayOfYear), 1, getDaysInYear(year));
  const { equationOfTimeMinutes, declinationRadians } = getSolarTerms(
    year,
    safeDay,
    720
  );
  const noonInstant = solarSelectionToInstant(
    { year, dayOfYear: safeDay, minutes: 720 },
    location.timeZone
  );
  const timeZoneOffsetHours =
    getTimeZoneOffsetMinutes(noonInstant, location.timeZone) / 60;
  const latitudeRadians = degToRadNumeric(location.latitude);
  const hourAngleCosine = getSelectableHourAngleCosine(
    latitudeRadians,
    declinationRadians
  );
  const solarNoonMinutes =
    720 -
    4 * location.longitude -
    equationOfTimeMinutes +
    60 * timeZoneOffsetHours;

  if (hourAngleCosine >= 1) {
    return {
      sunriseMinutes: solarNoonMinutes,
      solarNoonMinutes,
      sunsetMinutes: solarNoonMinutes,
      polarDay: false,
      polarNight: true,
    };
  }
  if (hourAngleCosine <= -1) {
    return {
      sunriseMinutes: 0,
      solarNoonMinutes,
      sunsetMinutes: MINUTES_PER_DAY,
      polarDay: true,
      polarNight: false,
    };
  }

  const hourAngleDegrees = radToDegNumeric(Math.acos(hourAngleCosine));
  const initialSunriseMinutes = solarNoonMinutes - 4 * hourAngleDegrees;
  const initialSunsetMinutes = solarNoonMinutes + 4 * hourAngleDegrees;
  return {
    sunriseMinutes: clamp(
      resolveDaylightBoundaryMinutes(
        year,
        safeDay,
        location,
        timeZoneOffsetHours,
        initialSunriseMinutes,
        -1
      ),
      0,
      MINUTES_PER_DAY
    ),
    solarNoonMinutes,
    sunsetMinutes: clamp(
      resolveDaylightBoundaryMinutes(
        year,
        safeDay,
        location,
        timeZoneOffsetHours,
        initialSunsetMinutes,
        1
      ),
      0,
      MINUTES_PER_DAY
    ),
    polarDay: false,
    polarNight: false,
  };
};

export const clampSelectionToDaylight = (
  selection: SolarSelection,
  location: SolarLocation
): SolarSelection | null => {
  const dayOfYear = clamp(
    Math.round(selection.dayOfYear),
    1,
    getDaysInYear(selection.year)
  );
  const daylight = getDaylightWindow(selection.year, dayOfYear, location);
  if (daylight.polarNight) return null;
  const minimum = daylight.polarDay ? 0 : Math.ceil(daylight.sunriseMinutes);
  const maximum = daylight.polarDay
    ? MINUTES_PER_DAY - 1
    : Math.floor(daylight.sunsetMinutes);
  if (minimum > maximum) return null;
  return {
    year: selection.year,
    dayOfYear,
    minutes: clamp(Math.round(selection.minutes), minimum, maximum),
  };
};

export const getSolarPosition = (
  selection: SolarSelection,
  location: SolarLocation
): SolarPosition => {
  const instant = solarSelectionToInstant(selection, location.timeZone);
  const offsetHours = getTimeZoneOffsetMinutes(instant, location.timeZone) / 60;
  const { equationOfTimeMinutes, declinationRadians } = getSolarTerms(
    selection.year,
    selection.dayOfYear,
    selection.minutes
  );
  const trueSolarMinutes = normalizeMinutes(
    selection.minutes +
      equationOfTimeMinutes +
      4 * location.longitude -
      60 * offsetHours
  );
  const hourAngleRadians = degToRadNumeric(trueSolarMinutes / 4 - 180);
  const latitudeRadians = degToRadNumeric(location.latitude);
  const zenithCosine = clamp(
    Math.sin(latitudeRadians) * Math.sin(declinationRadians) +
      Math.cos(latitudeRadians) *
        Math.cos(declinationRadians) *
        Math.cos(hourAngleRadians),
    -1,
    1
  );
  const elevationDegrees = 90 - radToDegNumeric(Math.acos(zenithCosine));
  const azimuthDegrees =
    (radToDegNumeric(
      Math.atan2(
        Math.sin(hourAngleRadians),
        Math.cos(hourAngleRadians) * Math.sin(latitudeRadians) -
          Math.tan(declinationRadians) * Math.cos(latitudeRadians)
      )
    ) +
      180 +
      360) %
    360;

  return { instant, azimuthDegrees, elevationDegrees };
};

const resolveShadowSimulationLocation = (
  location: Partial<SolarLocation>
): SolarLocation => ({
  latitude: location.latitude ?? DEFAULT_SHADOW_SIMULATION_LOCATION.latitude,
  longitude: location.longitude ?? DEFAULT_SHADOW_SIMULATION_LOCATION.longitude,
  timeZone: location.timeZone ?? DEFAULT_SHADOW_SIMULATION_LOCATION.timeZone,
});

export const clampShadowSimulationSelectionToDaylight = (
  selection: SolarSelection,
  location: Partial<SolarLocation> = {}
): SolarSelection | null =>
  clampSelectionToDaylight(
    selection,
    resolveShadowSimulationLocation(location)
  );
