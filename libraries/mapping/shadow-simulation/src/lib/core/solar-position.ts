import { clamp } from "@carma-commons/math";
import {
  getDaysInYear,
  getZonedUtcOffsetMinutes,
  instantToZonedYearDayTime,
  type YearDayTime,
  type ZonedYearDayTime,
  zonedYearDayTimeToInstant,
} from "@carma-commons/utils";
import { degToRadNumeric, radToDegNumeric } from "@carma-units";

const MINUTES_PER_DAY = 24 * 60;

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

const normalizeMinutes = (minutes: number) =>
  ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

export const solarSelectionToInstant = (
  selection: SolarSelection
): Date =>
  zonedYearDayTimeToInstant({
    ...selection,
    dayOfYear: clamp(
      Math.round(selection.dayOfYear),
      1,
      getDaysInYear(selection.year)
    ),
    minutes: clamp(
      Math.round(selection.minutes),
      0,
      MINUTES_PER_DAY - 1
    ),
  });

export const getSolarSelectionForInstant = (
  instant: Date,
  timeZone: string
): SolarSelection => {
  return instantToZonedYearDayTime(instant, timeZone);
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
  selection: Pick<SolarSelection, "year" | "dayOfYear" | "timeZone">,
  location: SolarLocation
): DaylightWindow => {
  const { year, dayOfYear } = selection;
  const safeDay = clamp(Math.round(dayOfYear), 1, getDaysInYear(year));
  const { equationOfTimeMinutes, declinationRadians } = getSolarTerms(
    year,
    safeDay,
    720
  );
  const timeZoneOffsetHours =
    getZonedUtcOffsetMinutes({
      ...selection,
      dayOfYear: safeDay,
      minutes: 720,
    }) / 60;
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
  const daylight = getDaylightWindow(
    { ...selection, dayOfYear },
    location
  );
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
  const offsetHours = getZonedUtcOffsetMinutes(selection) / 60;
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
