/**
 * The time series a scene runs, steered from the phone: play, pause and the
 * step it shows.
 *
 * The phone says what it wants in the display's state document
 * (`TimeSeriesControl`), the same desired-state way as the scene itself. The
 * display never answers, so while the series plays the phone only knows where
 * it is by counting along on its own clock (`SeriesClock`). That count is an
 * estimate and may be a step off; the display is what is right.
 *
 * Which series a scene runs is read from the scene: the layer whose tools carry
 * a complete `timeSlider` config launches it on the display, see
 * `getLayerLaunchedAddons` in `@carma-mapping/addons`. The selection here
 * follows it, restated because that package imports this one.
 */

import type { MappingConfig } from "@carma-api";

/** the series' own row in a layer stack; the display never launches from it */
const TIME_SLIDER_ROW_ID = "__timeSlider__";

/** the engine's defaults, see `TimeSlider.tsx` */
const DEFAULT_PLAY_INTERVAL_MS = 60;
const DEFAULT_INTERMEDIATE_VALUES_COUNT = 20;

/**
 * The series' entry in the display's state document.
 *
 * `step` is where the phone believes the series is. The display jumps there
 * only when `seekAt` is new, i.e. the presenter moved the slider, or on its
 * first apply after it started: the phone repeats the entry in every write, and
 * a running animation must not be pulled back by a moving pointer.
 */
export type TimeSeriesControl = {
  /** whole time step, 0 is the first */
  step: number;
  playing: boolean;
  /** when the presenter last moved the slider, as the phone's clock says */
  seekAt?: number;
};

/** what the phone needs of the series a scene runs */
export type SceneSeries = {
  /** the same for the same series in any scene */
  key: string;
  title: string;
  labels: readonly string[];
  stepCount: number;
  initialStep: number;
  /** whether the display starts playing it by itself */
  autoplay: boolean;
  /**
   * How long the display takes from one step to the next while playing. The
   * pace of a build with the caged crossfade; without it the display runs
   * twice as fast.
   */
  stepMs: number;
};

/**
 * The phone's own account of the series: the step it was at `since`, and
 * whether it has been counting on from there.
 */
export type SeriesClock = {
  step: number;
  playing: boolean;
  since: number;
  seekAt?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

/** the config of a `timeSlider` entry, written as `{ addon }` or `{ kind }` */
const timeSliderConfigOf = (
  entry: unknown
): Record<string, unknown> | undefined => {
  if (!isRecord(entry)) {
    return undefined;
  }
  const kind = entry["addon"] ?? entry["kind"];
  return kind === "timeSlider" && isRecord(entry["config"])
    ? entry["config"]
    : undefined;
};

const seriesOfConfig = (
  config: Record<string, unknown>
): SceneSeries | null => {
  const { wmsUrl, layers } = config;
  if (typeof wmsUrl !== "string" || !wmsUrl || !isStringList(layers)) {
    return null;
  }
  if (layers.length === 0) {
    return null;
  }
  const styles = typeof config["styles"] === "string" ? config["styles"] : "";
  const intermediate = isFiniteNumber(config["intermediateValuesCount"])
    ? Math.max(1, Math.round(config["intermediateValuesCount"]))
    : DEFAULT_INTERMEDIATE_VALUES_COUNT;
  const interval = isFiniteNumber(config["playIntervalMs"])
    ? config["playIntervalMs"]
    : DEFAULT_PLAY_INTERVAL_MS;
  const initialStep = isFiniteNumber(config["initialStep"])
    ? Math.round(config["initialStep"])
    : 0;
  return {
    key: JSON.stringify([wmsUrl, styles, layers]),
    title: typeof config["title"] === "string" ? config["title"] : "Zeitreihe",
    labels: isStringList(config["labels"]) ? config["labels"] : [],
    stepCount: layers.length,
    initialStep: Math.max(0, Math.min(initialStep, layers.length - 1)),
    autoplay: config["autoplay"] === true,
    stepMs: interval * intermediate,
  };
};

/** The series the display runs for this scene, or null when it runs none. */
export const findSceneSeries = (
  config: MappingConfig | null | undefined
): SceneSeries | null => {
  let found: SceneSeries | null = null;
  for (const layer of config?.layers ?? []) {
    if (layer.id === TIME_SLIDER_ROW_ID || !Array.isArray(layer["tools"])) {
      continue;
    }
    for (const tool of layer["tools"] as unknown[]) {
      const toolConfig = timeSliderConfigOf(tool);
      const series = toolConfig ? seriesOfConfig(toolConfig) : null;
      if (series) {
        // later layers are drawn on top, and the topmost one wins
        found = series;
        break;
      }
    }
  }
  return found;
};

/**
 * The step the clock says the display is at. Playing, the display walks from
 * the first to the last step and then starts over, so one round is one step
 * shorter than the series is long.
 */
export const clockStep = (
  clock: SeriesClock,
  series: Pick<SceneSeries, "stepCount" | "stepMs">,
  now: number
): number => {
  const last = Math.max(series.stepCount - 1, 0);
  const step = Math.max(0, Math.min(Math.round(clock.step), last));
  if (!clock.playing || last === 0 || series.stepMs <= 0) {
    return step;
  }
  const position = step + Math.max(0, now - clock.since) / series.stepMs;
  return Math.round(position % last);
};

/** the entry the phone writes for its clock at `now` */
export const seriesControlOf = (
  clock: SeriesClock,
  series: Pick<SceneSeries, "stepCount" | "stepMs">,
  now: number
): TimeSeriesControl => ({
  step: clockStep(clock, series, now),
  playing: clock.playing,
  ...(clock.seekAt !== undefined ? { seekAt: clock.seekAt } : {}),
});

export const isTimeSeriesControl = (
  value: unknown
): value is TimeSeriesControl =>
  isRecord(value) &&
  Number.isInteger(value["step"]) &&
  (value["step"] as number) >= 0 &&
  typeof value["playing"] === "boolean" &&
  (value["seekAt"] === undefined || isFiniteNumber(value["seekAt"]));

/** what the display took over from the entry the last time */
export type AppliedSeriesControl = Pick<
  TimeSeriesControl,
  "playing" | "seekAt"
>;

/**
 * What the display does with an entry: jump to its step and take over its play
 * state on the first apply, afterwards jump only on a new seek and switch play
 * only when it changed. `applied` is null on the first apply, which the display
 * resets whenever another series comes on.
 */
export const planSeriesApply = (
  applied: AppliedSeriesControl | null,
  wanted: TimeSeriesControl
): { seekTo?: number; play?: boolean } => {
  if (!applied) {
    return { seekTo: wanted.step, play: wanted.playing };
  }
  return {
    ...(wanted.seekAt !== applied.seekAt ? { seekTo: wanted.step } : {}),
    ...(wanted.playing !== applied.playing ? { play: wanted.playing } : {}),
  };
};
