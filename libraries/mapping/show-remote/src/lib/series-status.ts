/**
 * Where the display's time series stands, for the remote: how many of its
 * frames are in, whether its clock may run, and the step it shows.
 *
 * The phone steers the series through the display state (`TimeSeriesControl`),
 * but a display with frames from the http cache holds its clock until all of
 * them are in (`clockMayRun` in the time slider addon), which with 24 large
 * frames takes a while. A phone counting on its own clock runs off meanwhile.
 * So the display says where it is, and the phone waits while it loads and then
 * follows it.
 *
 * The display writes this into a session of its own, like `DisplayInfo` and
 * the snapshot answer, since writing into the display state would overwrite
 * what the remote wants. It writes on every change and repeats itself every
 * `SERIES_STATUS_HEARTBEAT_MS`; `null` means it runs no series. A display that
 * never writes (a build from before this existed) leaves the phone on its own
 * clock, as before.
 */

import type { RelayTarget } from "./relay-writer";
import {
  clockStep,
  seriesControlOf,
  type SceneSeries,
  type SeriesClock,
  type TimeSeriesControl,
} from "./time-series";

export type SeriesStatus = {
  /** the series, as `SceneSeries.key` names it */
  key: string;
  /** frames in the series, one per time step */
  total: number;
  /** frames the display holds for its viewport */
  loaded: number;
  /** frames it gave up on; playing again asks for them once more */
  failed: number;
  /** whether the display's clock may run; while false it holds its step */
  ready: boolean;
  /** the whole step it shows, 0 is the first */
  step: number;
  /** whether it is set to play; not ready, it holds nevertheless */
  playing: boolean;
  /** the remote's last seek it shows, see `TimeSeriesControl.seekAt` */
  seekAt?: number;
};

/** how often the display repeats an unchanged status */
export const SERIES_STATUS_HEARTBEAT_MS = 10_000;

/** older than this, a status is from a display that is gone or stopped telling */
export const SERIES_STATUS_STALE_MS = 3 * SERIES_STATUS_HEARTBEAT_MS + 5_000;

/**
 * How long a seek of the phone's own wins over a status that does not show
 * it yet: the answer takes a round trip, and one that never comes must not
 * freeze the slider.
 */
export const SERIES_SEEK_GRACE_MS = 5_000;

/** the relay accepts `[A-Z0-9_-]{4,32}` for codes a remote brings along */
export const seriesStatusSessionCode = (code: string): string =>
  `${code.trim().toUpperCase()}-T`;

export const seriesStatusTarget = (target: RelayTarget): RelayTarget => ({
  baseUrl: target.baseUrl,
  code: seriesStatusSessionCode(target.code),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCount = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0;

export const isSeriesStatus = (value: unknown): value is SeriesStatus =>
  isRecord(value) &&
  typeof value["key"] === "string" &&
  isCount(value["total"]) &&
  isCount(value["loaded"]) &&
  isCount(value["failed"]) &&
  typeof value["ready"] === "boolean" &&
  isCount(value["step"]) &&
  typeof value["playing"] === "boolean" &&
  (value["seekAt"] === undefined ||
    (typeof value["seekAt"] === "number" && Number.isFinite(value["seekAt"])));

/** a status, and when the display wrote it on the phone's clock */
export type HeardSeriesStatus = { status: SeriesStatus; writtenAt: number };

/**
 * What the phone's slider shows. `own`: no word from the display, the phone
 * counts on its own clock. `loading`: the display holds while its frames come
 * in, and so does the slider. `following`: the display runs, the slider shows
 * its step.
 */
export type SeriesView =
  | { kind: "own"; step: number }
  | {
      kind: "loading";
      step: number;
      loaded: number;
      total: number;
      failed: number;
    }
  | { kind: "following"; step: number };

type ViewedSeries = Pick<SceneSeries, "key" | "stepCount" | "stepMs">;

/** whether `heard` speaks of this series and is recent enough to go by */
export const isSeriesStatusCurrent = (
  heard: HeardSeriesStatus | null,
  series: Pick<SceneSeries, "key">,
  now: number
): heard is HeardSeriesStatus =>
  heard !== null &&
  heard.status.key === series.key &&
  now - heard.writtenAt < SERIES_STATUS_STALE_MS;

/** whether the phone moved the slider and the display does not show it yet */
export const isSeekPending = (
  clock: SeriesClock,
  status: SeriesStatus,
  now: number
): boolean =>
  clock.seekAt !== undefined &&
  clock.seekAt !== status.seekAt &&
  now - clock.seekAt < SERIES_SEEK_GRACE_MS;

const clampStep = (step: number, series: Pick<SceneSeries, "stepCount">) =>
  Math.max(0, Math.min(Math.round(step), Math.max(series.stepCount - 1, 0)));

export const seriesView = (
  clock: SeriesClock,
  series: ViewedSeries,
  heard: HeardSeriesStatus | null,
  now: number
): SeriesView => {
  if (!isSeriesStatusCurrent(heard, series, now)) {
    return { kind: "own", step: clockStep(clock, series, now) };
  }
  const { status } = heard;
  // a fresh seek shows where it goes, not where the display was before it
  const step = clampStep(
    isSeekPending(clock, status, now) ? clock.step : status.step,
    series
  );
  return status.ready
    ? { kind: "following", step }
    : {
        kind: "loading",
        step,
        loaded: status.loaded,
        total: status.total,
        failed: status.failed,
      };
};

/**
 * The phone's clock moved to where the display says it is, so it counts on
 * from there should the display go quiet. Unchanged while a seek of its own is
 * on the way, or when the status is not for this series.
 */
export const anchorSeriesClock = (
  clock: SeriesClock,
  series: ViewedSeries,
  heard: HeardSeriesStatus | null,
  now: number
): SeriesClock => {
  if (
    !isSeriesStatusCurrent(heard, series, now) ||
    isSeekPending(clock, heard.status, now)
  ) {
    return clock;
  }
  return { ...clock, step: clampStep(heard.status.step, series), since: now };
};

/**
 * The series' entry of a write: the phone's wishes, at the step the slider
 * shows. Only a display that starts afresh (a reload) takes the step over, see
 * `planSeriesApply`, and it should find the one it had.
 */
export const followedSeriesControl = (
  clock: SeriesClock,
  series: ViewedSeries,
  heard: HeardSeriesStatus | null,
  now: number
): TimeSeriesControl => ({
  ...seriesControlOf(clock, series, now),
  step: seriesView(clock, series, heard, now).step,
});
