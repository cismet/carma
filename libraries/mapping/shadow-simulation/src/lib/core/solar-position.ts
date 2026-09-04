import {
  AstroTime,
  Body,
  Equator,
  GeoVector,
  Horizon,
  Observer,
  RotateVector,
  Rotation_EQJ_EQD,
  SearchAltitude,
  SearchHourAngle,
  SiderealTime,
} from "astronomy-engine";

import { clamp } from "@carma-commons/math";
import {
  getDaysInYear,
  instantToZonedYearDayTime,
  offsetYearDay,
  type YearDayTime,
  type ZonedYearDayTime,
  zonedYearDayTimeToInstant,
} from "@carma-commons/utils";

const MINUTES_PER_DAY = 24 * 60;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;
const RADIANS_PER_SIDEREAL_HOUR = Math.PI / 12;

export const MEAN_SOLAR_ANGULAR_RADIUS_DEGREES = 0.2666;

export type SolarLocation = {
  latitude: number;
  longitude: number;
};

export const DEFAULT_SHADOW_SIMULATION_LOCATION: SolarLocation = {
  latitude: 51.256,
  longitude: 7.15,
};

export const DEFAULT_SHADOW_SIMULATION_TIME_ZONE = "Europe/Berlin";

export type SolarSelection = ZonedYearDayTime;

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

export const solarSelectionToInstant = (selection: SolarSelection): Date => {
  const minutes = clamp(selection.minutes, 0, MINUTES_PER_DAY - 1);
  const wholeMinutes = Math.floor(minutes);
  const wholeMinuteInstant = zonedYearDayTimeToInstant({
    ...selection,
    dayOfYear: clamp(
      Math.round(selection.dayOfYear),
      1,
      getDaysInYear(selection.year)
    ),
    minutes: wholeMinutes,
  });
  return new Date(
    wholeMinuteInstant.getTime() + (minutes - wholeMinutes) * 60_000
  );
};

export const getSolarSelectionForInstant = (
  instant: Date,
  timeZone: string
): SolarSelection => {
  return instantToZonedYearDayTime(instant, timeZone);
};

const createObserver = ({ latitude, longitude }: SolarLocation) =>
  new Observer(latitude, longitude, 0);

const isOnLocalDay = (
  instant: Date,
  selection: Pick<SolarSelection, "year" | "dayOfYear" | "timeZone">
) => {
  const local = instantToZonedYearDayTime(instant, selection.timeZone);
  return (
    local.year === selection.year && local.dayOfYear === selection.dayOfYear
  );
};

const getLocalEventMinutes = (
  event: AstroTime | null,
  selection: Pick<SolarSelection, "year" | "dayOfYear" | "timeZone">
): number | null => {
  if (!event || !isOnLocalDay(event.date, selection)) return null;
  const local = instantToZonedYearDayTime(event.date, selection.timeZone);
  return (
    local.minutes +
    event.date.getUTCSeconds() / 60 +
    event.date.getUTCMilliseconds() / 60_000
  );
};

export const getSolarDirectionECEF = (
  instant: Date
): readonly [number, number, number] => {
  const time = new AstroTime(instant);
  const equatorialOfDate = RotateVector(
    Rotation_EQJ_EQD(time),
    GeoVector(Body.Sun, time, true)
  );
  const siderealAngle = SiderealTime(time) * RADIANS_PER_SIDEREAL_HOUR;
  const cosSiderealAngle = Math.cos(siderealAngle);
  const sinSiderealAngle = Math.sin(siderealAngle);
  const x =
    cosSiderealAngle * equatorialOfDate.x +
    sinSiderealAngle * equatorialOfDate.y;
  const y =
    -sinSiderealAngle * equatorialOfDate.x +
    cosSiderealAngle * equatorialOfDate.y;
  const inverseLength = 1 / Math.hypot(x, y, equatorialOfDate.z);

  return [
    x * inverseLength,
    y * inverseLength,
    equatorialOfDate.z * inverseLength,
  ];
};

export const getDaylightWindow = (
  selection: Pick<SolarSelection, "year" | "dayOfYear" | "timeZone">,
  location: SolarLocation
): DaylightWindow => {
  const { year, dayOfYear } = selection;
  const safeDay = clamp(Math.round(dayOfYear), 1, getDaysInYear(year));
  const localDay = { ...selection, year, dayOfYear: safeDay };
  const dayStart = solarSelectionToInstant({ ...localDay, minutes: 0 });
  const nextDay = offsetYearDay({ year, dayOfYear: safeDay }, 1);
  const dayEnd = solarSelectionToInstant({
    ...localDay,
    ...nextDay,
    minutes: 0,
  });
  const searchDays =
    (dayEnd.getTime() - dayStart.getTime()) / MILLISECONDS_PER_DAY;
  const observer = createObserver(location);
  const sunriseMinutes = getLocalEventMinutes(
    SearchAltitude(
      Body.Sun,
      observer,
      1,
      dayStart,
      searchDays,
      MEAN_SOLAR_ANGULAR_RADIUS_DEGREES
    ),
    localDay
  );
  const sunsetMinutes = getLocalEventMinutes(
    SearchAltitude(
      Body.Sun,
      observer,
      -1,
      dayStart,
      searchDays,
      MEAN_SOLAR_ANGULAR_RADIUS_DEGREES
    ),
    localDay
  );
  const solarNoonEvent = SearchHourAngle(Body.Sun, observer, 0, dayStart, 1);
  const solarNoonMinutes =
    getLocalEventMinutes(solarNoonEvent.time, localDay) ?? MINUTES_PER_DAY / 2;
  const startsInDaylight =
    getSolarPosition({ ...localDay, minutes: 0 }, location).elevationDegrees >=
    MEAN_SOLAR_ANGULAR_RADIUS_DEGREES;
  const polarDay =
    sunriseMinutes === null && sunsetMinutes === null && startsInDaylight;
  const polarNight =
    sunriseMinutes === null && sunsetMinutes === null && !startsInDaylight;

  return {
    sunriseMinutes: sunriseMinutes ?? (startsInDaylight ? 0 : solarNoonMinutes),
    solarNoonMinutes,
    sunsetMinutes:
      sunsetMinutes ?? (startsInDaylight ? MINUTES_PER_DAY : solarNoonMinutes),
    polarDay,
    polarNight,
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
  const daylight = getDaylightWindow({ ...selection, dayOfYear }, location);
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
    timeZone: selection.timeZone,
  };
};

export const getSolarPosition = (
  selection: SolarSelection,
  location: SolarLocation
): SolarPosition => {
  const instant = solarSelectionToInstant(selection);
  const observer = createObserver(location);
  const equatorial = Equator(Body.Sun, instant, observer, true, true);
  const horizontal = Horizon(instant, observer, equatorial.ra, equatorial.dec);

  return {
    instant,
    azimuthDegrees: horizontal.azimuth,
    elevationDegrees: horizontal.altitude,
  };
};

const resolveShadowSimulationLocation = (
  location: Partial<SolarLocation>
): SolarLocation => ({
  latitude: location.latitude ?? DEFAULT_SHADOW_SIMULATION_LOCATION.latitude,
  longitude: location.longitude ?? DEFAULT_SHADOW_SIMULATION_LOCATION.longitude,
});

export const clampShadowSimulationSelectionToDaylight = (
  selection: YearDayTime,
  location: Partial<SolarLocation> & { timeZone?: string } = {}
): SolarSelection | null =>
  clampSelectionToDaylight(
    {
      ...selection,
      timeZone: location.timeZone ?? DEFAULT_SHADOW_SIMULATION_TIME_ZONE,
    },
    resolveShadowSimulationLocation(location)
  );
