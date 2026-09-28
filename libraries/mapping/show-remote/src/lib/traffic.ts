/**
 * The traffic a scene shows, steered from the phone: which moment of the last
 * 24 hours the vehicles on the model drive at.
 *
 * The moment is kept as an offset from now (`TrafficControl`), not as a
 * moment of its own: 0 is live, 60 is the traffic of an hour ago, and either
 * keeps running with the clock. The display shows `now - offsetMinutes` in real
 * time, so an offset set once stays right however long the scene stays up, and
 * the phone never has to count along the way it does for the shadows.
 *
 * "Tag" and "Nacht" are jumps to a fixed hour on that slider, the most recent
 * 13:00 and 23:00 inside the last 24 hours (`trafficJumpOffset`), so the night
 * button shows last night and the day button today's lunchtime, or
 * yesterday's before 13:00.
 *
 * Which traffic a scene runs is read from the scene: the layer whose tools carry
 * a `trafficAnimation` config with its `networkUrl` launches it on the display,
 * see `getLayerLaunchedAddons` in `@carma-mapping/addons`. The selection here
 * follows it, restated because that package imports this one.
 *
 * The clock is the shadows' (`SHADOW_TIME_ZONE`): the model is in Wuppertal,
 * whatever time zone the phone or the display machine is set to.
 */

import type { MappingConfig } from "@carma-api";

import { SHADOW_TIME_ZONE, approximateDaylight } from "./shadow";

/** how far back the slider reaches: 24 hours */
export const TRAFFIC_MAX_OFFSET_MINUTES = 1440;

/** the hour "Tag" jumps to, the most recent one inside the last 24 hours */
export const TRAFFIC_DAY_HOUR = 13;
/** the hour "Nacht" jumps to, the most recent one inside the last 24 hours */
export const TRAFFIC_NIGHT_HOUR = 23;

/**
 * How long dusk and dawn take on the model, in minutes, centred on sunset and
 * sunrise: the map darkens from 20 minutes before sunset to 20 minutes after.
 * Picked by eye for the projection, not a twilight definition.
 */
export const TRAFFIC_TWILIGHT_MINUTES = 40;

const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = MINUTES_PER_DAY * MS_PER_MINUTE;

/**
 * The traffic's entry in the display's state document.
 *
 * `offsetMinutes` is how far back the display shows, 0 for live. `seekAt` is
 * when the presenter last moved the slider or pressed a jump, as the phone's
 * clock says; the display may use it to tell a new wish from the repeated one,
 * though applying the same offset twice changes nothing.
 *
 * `restartAt` is when the presenter last asked for the traffic to start
 * afresh, by the same clock: every change of it throws all vehicles away and
 * fills the network anew at the moment shown. A display that sees it on
 * traffic it just started has nothing to throw away and leaves it.
 */
export type TrafficControl = {
  offsetMinutes: number;
  seekAt?: number;
  restartAt?: number;
};

/** the three jumps of the traffic panel */
export type TrafficJump = "day" | "night" | "live";

/** what the phone needs of the traffic a scene runs */
export type SceneTraffic = {
  /** the same for the same network in any scene */
  key: string;
  title: string;
  networkUrl: string;
  /** the offset the launch starts at; absent leaves the display where it is */
  initialOffsetMinutes?: number;
};

/** a moment on the traffic's clock */
export type TrafficClock = {
  year: number;
  /** 1 is 1 January */
  dayOfYear: number;
  /** minutes after local midnight, with the seconds as a fraction */
  minutes: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** an offset the display can show: whole minutes, 0 to 24 hours */
export const clampTrafficOffset = (minutes: number): number =>
  Number.isFinite(minutes)
    ? Math.max(0, Math.min(Math.round(minutes), TRAFFIC_MAX_OFFSET_MINUTES))
    : 0;

export const isTrafficControl = (value: unknown): value is TrafficControl =>
  isRecord(value) &&
  isFiniteNumber(value["offsetMinutes"]) &&
  value["offsetMinutes"] >= 0 &&
  value["offsetMinutes"] <= TRAFFIC_MAX_OFFSET_MINUTES &&
  (value["seekAt"] === undefined || isFiniteNumber(value["seekAt"])) &&
  (value["restartAt"] === undefined || isFiniteNumber(value["restartAt"]));

/**
 * One formatter for every call: building an `Intl.DateTimeFormat` costs far
 * more than using one, and the display asks about once a second.
 */
let clockFormat: Intl.DateTimeFormat | null = null;
const clockParts = (instant: number) => {
  clockFormat ??= new Intl.DateTimeFormat("en-US", {
    timeZone: SHADOW_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const parts = clockFormat.formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
};

/** `instant` on the traffic's clock, the way the shadows' clock reads it */
export const trafficClockOf = (instant: number): TrafficClock => {
  const { year, month, day, hour, minute, second } = clockParts(instant);
  const milliseconds = ((instant % 1000) + 1000) % 1000;
  return {
    year,
    dayOfYear:
      Math.round(
        (Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / MS_PER_DAY
      ) + 1,
    minutes: hour * 60 + minute + (second + milliseconds / 1000) / 60,
  };
};

/** `minutes` folded into (-720, 720], the short way round the clock face */
const shortWay = (minutes: number): number => {
  const folded = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return folded > MINUTES_PER_DAY / 2 ? folded - MINUTES_PER_DAY : folded;
};

/**
 * The most recent instant at or before `now` that reads `hour`:00 on the
 * traffic's clock.
 *
 * Counted back on the wall clock first, then corrected by what the clock
 * really reads there: on the two days a year the clocks change, the wall
 * clock and the elapsed time differ by an hour.
 */
const lastHourBefore = (hour: number, now: number): number => {
  const target = hour * 60;
  const back =
    (trafficClockOf(now).minutes - target + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  let candidate = now - back * MS_PER_MINUTE;
  candidate -= shortWay(trafficClockOf(candidate).minutes - target) * MS_PER_MINUTE;
  if (candidate > now) candidate -= MS_PER_DAY;
  return candidate;
};

/**
 * The offset the panel's jumps set: "day" the most recent 13:00, "night" the
 * most recent 23:00, "live" 0. Whole minutes, rounded down, so the moment shown
 * is never before the hour asked for; at most 24 hours.
 */
export const trafficJumpOffset = (kind: TrafficJump, now: Date): number => {
  if (kind === "live") return 0;
  const nowMs = now.getTime();
  const hour = kind === "day" ? TRAFFIC_DAY_HOUR : TRAFFIC_NIGHT_HOUR;
  const at = lastHourBefore(hour, nowMs);
  return Math.max(
    0,
    Math.min(Math.floor((nowMs - at) / MS_PER_MINUTE), TRAFFIC_MAX_OFFSET_MINUTES)
  );
};

/** 0 below `edge0`, 1 above `edge1`, smooth in between */
const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * How dark it is at `instant` on the model, 0 in daylight and 1 at night, with
 * a ramp of `twilightMinutes` centred on sunrise and sunset. Sunrise and sunset
 * are the shadows' approximation for the model's centre, good to a few
 * minutes, which is plenty for when the headlights come on.
 */
export const trafficDarkness = (
  instant: number,
  twilightMinutes = TRAFFIC_TWILIGHT_MINUTES
): number => {
  const { year, dayOfYear, minutes } = trafficClockOf(instant);
  const { sunriseMinutes, sunsetMinutes } = approximateDaylight({
    year,
    dayOfYear,
  });
  const half = Math.max(1, twilightMinutes) / 2;
  const morning = smoothstep(sunriseMinutes - half, sunriseMinutes + half, minutes);
  const evening =
    1 - smoothstep(sunsetMinutes - half, sunsetMinutes + half, minutes);
  return 1 - Math.min(morning, evening);
};

let labelFormat: Intl.DateTimeFormat | null = null;

/** `instant` as the panels show it, e.g. "Sa., 26.09., 23:00" */
export const formatTrafficTime = (instant: number): string => {
  labelFormat ??= new Intl.DateTimeFormat("de-DE", {
    timeZone: SHADOW_TIME_ZONE,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return labelFormat.format(new Date(instant));
};

/** the config of a `trafficAnimation` entry, written as `{ addon }` or `{ kind }` */
const trafficConfigOf = (
  entry: unknown
): Record<string, unknown> | undefined => {
  if (!isRecord(entry)) {
    return undefined;
  }
  const kind = entry["addon"] ?? entry["kind"];
  return kind === "trafficAnimation" && isRecord(entry["config"])
    ? entry["config"]
    : undefined;
};

/** the traffic a `trafficAnimation` config launches, or null when it launches none */
export const trafficOfConfig = (
  config: Record<string, unknown>
): SceneTraffic | null => {
  const { networkUrl } = config;
  if (typeof networkUrl !== "string" || !networkUrl) {
    return null;
  }
  const initial = config["initialOffsetMinutes"];
  return {
    key: JSON.stringify([networkUrl]),
    title: typeof config["title"] === "string" ? config["title"] : "Verkehr",
    networkUrl,
    ...(isFiniteNumber(initial)
      ? { initialOffsetMinutes: clampTrafficOffset(initial) }
      : {}),
  };
};

/** The traffic the display runs for this scene, or null when it runs none. */
export const findSceneTraffic = (
  config: MappingConfig | null | undefined
): SceneTraffic | null => {
  let found: SceneTraffic | null = null;
  for (const layer of config?.layers ?? []) {
    if (!Array.isArray(layer["tools"])) {
      continue;
    }
    for (const tool of layer["tools"] as unknown[]) {
      const toolConfig = trafficConfigOf(tool);
      const traffic = toolConfig ? trafficOfConfig(toolConfig) : null;
      if (traffic) {
        // later layers are drawn on top, and the topmost one wins
        found = traffic;
        break;
      }
    }
  }
  return found;
};
