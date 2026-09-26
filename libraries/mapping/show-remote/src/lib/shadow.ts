/**
 * The shadows a scene casts, steered from the phone: the date and the time of
 * day they are cast at, whether the day or the year plays, and how long one
 * pass of it takes.
 *
 * The same desired-state way as the time series (`time-series.ts`): the phone
 * says what it wants in the display's state document (`ShadowControl`), the
 * display never answers, and while something plays the phone only knows where
 * the display is by counting along on its own clock (`ShadowClock`). That
 * count is an estimate; the display is what is right.
 *
 * Which shadows a scene casts is read from the scene: the layer whose tools
 * carry a `shadowTexture` config with its `assetBaseUrl` launches them on the
 * display, see `getLayerLaunchedAddons` in `@carma-mapping/addons`. The
 * selection here follows it, restated because that package imports this one.
 * The launch puts the shadows on the moment the config names, so phone and
 * display start from the same one.
 *
 * The display's playback (`advanceShadowAnimationFrame` in
 * `@carma-mapping/shadow-simulation`) is restated here as well, with sunrise
 * and sunset approximated: that package's solar maths would bring half the
 * map stack onto the phone.
 */

import type { MappingConfig } from "@carma-api";

import { DEFAULT_SHADOW_CYCLE_SECONDS } from "./shadow-cycle";

/** the shadows' own row in a layer stack; the display never launches from it */
const SHADOW_TEXTURE_ROW_ID = "__shadow_texture__";

/**
 * Where the shadows are cast, for sunrise and sunset: the printed model's
 * centre, `DZ_B_PRM_POSITION` in `@carma-mapping/addons`.
 */
export const SHADOW_TEXTURE_LOCATION = {
  longitude: 7.112016,
  latitude: 51.245446,
} as const;

/** the time zone the shadows' clock runs in, as the display's default */
export const SHADOW_TIME_ZONE = "Europe/Berlin";

/**
 * A launch naming no time starts this long before sunrise, in the dark, so
 * that playing the day shows the sun come up.
 */
export const SHADOW_START_BEFORE_SUNRISE_MINUTES = 60;

const MINUTES_PER_DAY = 24 * 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** what plays: the hours of the day or the days of the year */
export type ShadowPlay = "day" | "year";

/** a moment of the shadows, in the display's terms */
export type ShadowMoment = {
  year: number;
  /** 1 is 1 January */
  dayOfYear: number;
  /** minutes after local midnight */
  minutes: number;
};

/**
 * The shadows' entry in the display's state document.
 *
 * `dayOfYear` and `minutes` are where the phone believes the display is. The
 * display jumps there only when `seekAt` is new, i.e. the presenter moved a
 * slider, or on its first apply after the shadows came on: the phone repeats
 * the entry in every write, and a running playback must not be pulled back.
 */
export type ShadowControl = {
  dayOfYear: number;
  minutes: number;
  /** what plays, null when it stands still */
  play: ShadowPlay | null;
  /** how long one pass takes: a day, its daylight, or a year */
  cycleSeconds: number;
  /** when the presenter last moved a slider, as the phone's clock says */
  seekAt?: number;
};

/** what the phone needs of the shadows a scene casts */
export type SceneShadow = {
  /** the same for the same shadows starting from the same moment */
  key: string;
  title: string;
  /** the moment the launch puts them on; absent is today, an hour before sunrise */
  initialDayOfYear?: number;
  initialMinutes?: number;
  /** what the display starts playing by itself */
  autoplay: ShadowPlay | null;
  cycleSeconds: number;
  /** day play walks from sunrise to sunset instead of all 24 hours */
  daylightOnly: boolean;
};

/**
 * The phone's own account of the shadows: the moment they were at `since`, and
 * what has been playing from there.
 */
export type ShadowClock = {
  date: ShadowMoment;
  play: ShadowPlay | null;
  cycleSeconds: number;
  since: number;
  seekAt?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isShadowPlay = (value: unknown): value is ShadowPlay =>
  value === "day" || value === "year";

export const daysInYear = (year: number): number =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;

/** the day of `dayOfYear` in `year`, the 366th of a common year its last */
export const clampDayOfYear = (year: number, dayOfYear: number): number =>
  Math.max(1, Math.min(Math.round(dayOfYear), daysInYear(year)));

/** the parts of an instant on the shadows' clock */
const zonedParts = (instant: number) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHADOW_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
  };
};

/** the day `now` falls on, on the shadows' clock */
export const shadowDayOf = (
  now: number
): Pick<ShadowMoment, "year" | "dayOfYear"> => {
  const { year, month, day } = zonedParts(now);
  return {
    year,
    dayOfYear:
      Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / MS_PER_DAY) + 1,
  };
};

/** how many minutes the shadows' clock is ahead of UTC on that day */
const zoneOffsetMinutes = (year: number, dayOfYear: number): number => {
  const noon = Date.UTC(year, 0, dayOfYear, 12);
  const local = zonedParts(noon);
  return Math.round(
    (Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) -
      noon) /
      60_000
  );
};

/**
 * Sunrise, highest sun and sunset in minutes on the shadows' clock, after the
 * NOAA approximation, for the sun's upper edge the display counts daylight
 * from (0.2666° above the horizon, no refraction). Within a few minutes of
 * what the display computes, which is all counting along needs.
 */
export const approximateDaylight = ({
  year,
  dayOfYear,
}: Pick<ShadowMoment, "year" | "dayOfYear">): {
  sunriseMinutes: number;
  noonMinutes: number;
  sunsetMinutes: number;
} => {
  const gamma = ((2 * Math.PI) / daysInYear(year)) * (dayOfYear - 1);
  const equationOfTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const declination =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const latitude = (SHADOW_TEXTURE_LOCATION.latitude * Math.PI) / 180;
  const zenith = ((90 - 0.2666) * Math.PI) / 180;
  const cosHourAngle =
    Math.cos(zenith) / (Math.cos(latitude) * Math.cos(declination)) -
    Math.tan(latitude) * Math.tan(declination);
  const hourAngle =
    (Math.acos(Math.max(-1, Math.min(1, cosHourAngle))) * 180) / Math.PI;
  const noon =
    720 -
    4 * SHADOW_TEXTURE_LOCATION.longitude -
    equationOfTime +
    zoneOffsetMinutes(year, dayOfYear);
  return {
    sunriseMinutes: noon - 4 * hourAngle,
    noonMinutes: noon,
    sunsetMinutes: noon + 4 * hourAngle,
  };
};

/** a day of the year worth jumping to, named for the presenter */
export type ShadowSeasonDay = {
  id: "spring" | "longest" | "autumn" | "shortest";
  label: string;
  dayOfYear: number;
};

/**
 * Mean equinoxes and solstices after Meeus, Astronomical Algorithms, table
 * 27.b (years 2000 to 3000), as Julian Ephemeris Days: within half an hour of
 * the true moment, plenty for naming the day. The NOAA series above is a day
 * late on all four in 2026.
 */
const SEASON_POLYNOMIALS: ReadonlyArray<{
  id: ShadowSeasonDay["id"];
  label: string;
  terms: readonly [number, number, number, number, number];
}> = [
  {
    id: "spring",
    label: "Frühlingsanfang",
    terms: [2451623.80984, 365242.37404, 0.05169, -0.00411, -0.00057],
  },
  {
    id: "longest",
    label: "Längster Tag",
    terms: [2451716.56767, 365241.62603, 0.00325, 0.00888, -0.0003],
  },
  {
    id: "autumn",
    label: "Herbstanfang",
    terms: [2451810.21715, 365242.01767, -0.11575, 0.00337, 0.00078],
  },
  {
    id: "shortest",
    label: "Kürzester Tag",
    terms: [2451900.05952, 365242.74049, -0.06223, -0.00823, 0.00032],
  },
];

/** Julian Day 0 is this many days before the Unix epoch */
const UNIX_EPOCH_JULIAN_DAY = 2440587.5;

/**
 * The equinoxes and solstices of `year`, in date order, each on the day it
 * falls on on the shadows' clock.
 */
export const shadowSeasonDays = (year: number): ShadowSeasonDay[] => {
  const millennia = (year - 2000) / 1000;
  return SEASON_POLYNOMIALS.map(({ id, label, terms }) => {
    const julianDay = terms.reduce(
      (sum, term, power) => sum + term * millennia ** power,
      0
    );
    const instant = (julianDay - UNIX_EPOCH_JULIAN_DAY) * MS_PER_DAY;
    return { id, label, dayOfYear: shadowDayOf(instant).dayOfYear };
  });
};

/** the config of a `shadowTexture` entry, written as `{ addon }` or `{ kind }` */
const shadowTextureConfigOf = (
  entry: unknown
): Record<string, unknown> | undefined => {
  if (!isRecord(entry)) {
    return undefined;
  }
  const kind = entry["addon"] ?? entry["kind"];
  return kind === "shadowTexture" && isRecord(entry["config"])
    ? entry["config"]
    : undefined;
};

/**
 * The shadows a `shadowTexture` config launches, or null when it launches
 * none. Also what the display keys its launch by.
 */
export const shadowOfConfig = (
  config: Record<string, unknown>
): SceneShadow | null => {
  const { assetBaseUrl } = config;
  if (typeof assetBaseUrl !== "string" || !assetBaseUrl) {
    return null;
  }
  const initialDayOfYear = isFiniteNumber(config["initialDayOfYear"])
    ? Math.round(config["initialDayOfYear"])
    : undefined;
  const initialMinutes = isFiniteNumber(config["initialMinutes"])
    ? Math.round(config["initialMinutes"])
    : undefined;
  const autoplay = isShadowPlay(config["autoplay"]) ? config["autoplay"] : null;
  const cycleSeconds =
    isFiniteNumber(config["cycleSeconds"]) && config["cycleSeconds"] > 0
      ? config["cycleSeconds"]
      : DEFAULT_SHADOW_CYCLE_SECONDS;
  const daylightOnly = config["daylightOnly"] === true;
  return {
    key: JSON.stringify([
      assetBaseUrl,
      initialDayOfYear ?? null,
      initialMinutes ?? null,
      autoplay,
      cycleSeconds,
      daylightOnly,
    ]),
    title: typeof config["title"] === "string" ? config["title"] : "Schatten",
    ...(initialDayOfYear !== undefined ? { initialDayOfYear } : {}),
    ...(initialMinutes !== undefined ? { initialMinutes } : {}),
    autoplay,
    cycleSeconds,
    daylightOnly,
  };
};

/** The shadows the display casts for this scene, or null when it casts none. */
export const findSceneShadow = (
  config: MappingConfig | null | undefined
): SceneShadow | null => {
  let found: SceneShadow | null = null;
  for (const layer of config?.layers ?? []) {
    if (layer.id === SHADOW_TEXTURE_ROW_ID || !Array.isArray(layer["tools"])) {
      continue;
    }
    for (const tool of layer["tools"] as unknown[]) {
      const toolConfig = shadowTextureConfigOf(tool);
      const shadow = toolConfig ? shadowOfConfig(toolConfig) : null;
      if (shadow) {
        // later layers are drawn on top, and the topmost one wins
        found = shadow;
        break;
      }
    }
  }
  return found;
};

/**
 * The moment a launch of these shadows starts at, the display's way: the
 * configured day or today, at the configured time or an hour before sunrise.
 * Not moved into daylight: a start at night is meant.
 */
export const initialShadowDate = (
  shadow: Pick<SceneShadow, "initialDayOfYear" | "initialMinutes">,
  now: number
): ShadowMoment => {
  const today = shadowDayOf(now);
  const dayOfYear = clampDayOfYear(
    today.year,
    shadow.initialDayOfYear ?? today.dayOfYear
  );
  const minutes =
    shadow.initialMinutes ??
    Math.round(
      approximateDaylight({ year: today.year, dayOfYear }).sunriseMinutes -
        SHADOW_START_BEFORE_SUNRISE_MINUTES
    );
  return {
    year: today.year,
    dayOfYear,
    minutes: Math.max(0, Math.min(minutes, MINUTES_PER_DAY - 1)),
  };
};

/** the clock of a launch of these shadows, as the display starts them */
export const initialShadowClock = (
  shadow: SceneShadow,
  now: number
): ShadowClock => ({
  date: initialShadowDate(shadow, now),
  play: shadow.autoplay,
  cycleSeconds: shadow.cycleSeconds,
  since: now,
});

/**
 * The moment the clock says the display is at: a pass of the year, the day or
 * its daylight per `cycleSeconds`, starting over at its end the way the
 * display does.
 */
export const clockShadowDate = (
  clock: ShadowClock,
  shadow: Pick<SceneShadow, "daylightOnly">,
  now: number
): ShadowMoment => {
  const { date } = clock;
  if (!clock.play || clock.cycleSeconds <= 0) {
    return date;
  }
  const share = Math.max(0, now - clock.since) / (clock.cycleSeconds * 1000);
  if (clock.play === "year") {
    const days = daysInYear(date.year);
    return {
      ...date,
      dayOfYear: ((date.dayOfYear - 1 + Math.floor(share * days)) % days) + 1,
    };
  }
  if (!shadow.daylightOnly) {
    return {
      ...date,
      minutes: (date.minutes + share * MINUTES_PER_DAY) % MINUTES_PER_DAY,
    };
  }
  const { sunriseMinutes, sunsetMinutes } = approximateDaylight(date);
  const first = Math.ceil(sunriseMinutes);
  const last = Math.floor(sunsetMinutes);
  const start =
    date.minutes < first || date.minutes > last ? first : date.minutes;
  const next = start + share * Math.max(1, sunsetMinutes - sunriseMinutes);
  return {
    ...date,
    minutes:
      next > last ? first + ((next - first) % Math.max(1, last - first)) : next,
  };
};

/** the entry the phone writes for its clock at `now` */
export const shadowControlOf = (
  clock: ShadowClock,
  shadow: Pick<SceneShadow, "daylightOnly">,
  now: number
): ShadowControl => {
  const { dayOfYear, minutes } = clockShadowDate(clock, shadow, now);
  return {
    dayOfYear,
    minutes: Math.round(minutes) % MINUTES_PER_DAY,
    play: clock.play,
    cycleSeconds: clock.cycleSeconds,
    ...(clock.seekAt !== undefined ? { seekAt: clock.seekAt } : {}),
  };
};

export const isShadowControl = (value: unknown): value is ShadowControl =>
  isRecord(value) &&
  Number.isInteger(value["dayOfYear"]) &&
  (value["dayOfYear"] as number) >= 1 &&
  (value["dayOfYear"] as number) <= 366 &&
  isFiniteNumber(value["minutes"]) &&
  value["minutes"] >= 0 &&
  value["minutes"] < MINUTES_PER_DAY &&
  (value["play"] === null || isShadowPlay(value["play"])) &&
  isFiniteNumber(value["cycleSeconds"]) &&
  value["cycleSeconds"] > 0 &&
  (value["seekAt"] === undefined || isFiniteNumber(value["seekAt"]));

/** what the display took over from the entry the last time */
export type AppliedShadowControl = Pick<
  ShadowControl,
  "play" | "cycleSeconds" | "seekAt"
>;

/**
 * What the display does with an entry: jump to its moment and take over what
 * plays and how fast on the first apply, afterwards jump only on a new seek and
 * switch the rest only when it changed. `applied` is null on the first apply,
 * which the display resets whenever the shadows come on anew.
 */
export const planShadowApply = (
  applied: AppliedShadowControl | null,
  wanted: ShadowControl
): {
  seekTo?: Pick<ShadowControl, "dayOfYear" | "minutes">;
  play?: ShadowPlay | null;
  cycleSeconds?: number;
} => {
  const seekTo = { dayOfYear: wanted.dayOfYear, minutes: wanted.minutes };
  if (!applied) {
    return { seekTo, play: wanted.play, cycleSeconds: wanted.cycleSeconds };
  }
  return {
    ...(wanted.seekAt !== applied.seekAt ? { seekTo } : {}),
    ...(wanted.play !== applied.play ? { play: wanted.play } : {}),
    ...(wanted.cycleSeconds !== applied.cycleSeconds
      ? { cycleSeconds: wanted.cycleSeconds }
      : {}),
  };
};
