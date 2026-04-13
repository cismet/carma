import {
  DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC,
  NAVIGATION_ORBIT_DIRECTIONS,
  type NavigationOrbitDirection,
  type NavigationOrbitOptions,
  type NavigationTransitionOptions,
  type NavigationZoomOptions,
} from "@carma-mapping/engines-interop/navigation-controls";
import { degToRadNumeric } from "@carma-units";
import type { Seconds } from "@carma-units";
export const ZOOM_DELTA_PRESETS = {
  QUARTER: 0.25,
  THIRD: 1 / 3,
  HALF: 0.5,
  TWO_THIRDS: 2 / 3,
  ONE_AND_HALF: 1.5,
  ONE: 1,
  TWO: 2,
  THREE: 3,
} as const;

export const MIN_STORY_CESIUM_FOV_DEG = 0.1;
export const DEFAULT_STORY_CESIUM_MINIMUM_FOV_DEG = 2;
export const DEFAULT_STORY_CESIUM_MAXIMUM_FOV_DEG = 120;
export const MAX_STORY_CESIUM_FOV_DEG = 179;

export const ZOOM_DELTA_OPTIONS = [
  "quarter",
  "third",
  "half",
  "two-thirds",
  "one",
  "one-and-half",
  "two",
  "three",
] as const;

const ZOOM_DELTA_OPTION_VALUES = {
  quarter: ZOOM_DELTA_PRESETS.QUARTER,
  third: ZOOM_DELTA_PRESETS.THIRD,
  half: ZOOM_DELTA_PRESETS.HALF,
  "two-thirds": ZOOM_DELTA_PRESETS.TWO_THIRDS,
  one: ZOOM_DELTA_PRESETS.ONE,
  "one-and-half": ZOOM_DELTA_PRESETS.ONE_AND_HALF,
  two: ZOOM_DELTA_PRESETS.TWO,
  three: ZOOM_DELTA_PRESETS.THREE,
} as const;

const readOrbitRevolutionDurationSec = (durationSec?: Seconds | number) =>
  typeof durationSec === "number" &&
  Number.isFinite(durationSec) &&
  durationSec > 0
    ? (durationSec as Seconds)
    : DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC;

const readZoomDelta = (zoomDelta?: number) =>
  typeof zoomDelta === "number" && Number.isFinite(zoomDelta) && zoomDelta > 0
    ? zoomDelta
    : ZOOM_DELTA_PRESETS.ONE;

const readStoryCesiumFovDeg = (value: number | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(
        Math.max(value, MIN_STORY_CESIUM_FOV_DEG),
        MAX_STORY_CESIUM_FOV_DEG
      )
    : fallback;

const readStoryCesiumFovBoundsDeg = ({
  minimumFovDeg,
  maximumFovDeg,
}: {
  minimumFovDeg?: number;
  maximumFovDeg?: number;
}) => {
  const rawMinimumFovDeg = readStoryCesiumFovDeg(
    minimumFovDeg,
    DEFAULT_STORY_CESIUM_MINIMUM_FOV_DEG
  );
  const rawMaximumFovDeg = readStoryCesiumFovDeg(
    maximumFovDeg,
    DEFAULT_STORY_CESIUM_MAXIMUM_FOV_DEG
  );

  return {
    minimumFovDeg: Math.min(rawMinimumFovDeg, rawMaximumFovDeg),
    maximumFovDeg: Math.max(rawMinimumFovDeg, rawMaximumFovDeg),
  };
};

export const readZoomDeltaArgValue = (zoomDelta?: number | string) =>
  typeof zoomDelta === "string"
    ? ZOOM_DELTA_OPTION_VALUES[
        zoomDelta as keyof typeof ZOOM_DELTA_OPTION_VALUES
      ] ?? ZOOM_DELTA_PRESETS.ONE
    : readZoomDelta(zoomDelta);

export const buildHomeOptions = ({
  animate = true,
  durationMs = 900,
}: {
  animate?: boolean;
  durationMs?: number;
}): NavigationTransitionOptions => ({
  duration: (animate && durationMs > 0
    ? durationMs
    : 0) as NavigationTransitionOptions["duration"],
});

export const buildOrbitOptions = ({
  direction = NAVIGATION_ORBIT_DIRECTIONS.CW,
  revolutionDurationSec,
  durationMs,
  minPitchDeg,
  rangeM,
}: {
  direction?: NavigationOrbitDirection;
  revolutionDurationSec?: Seconds;
  durationMs?: number;
  minPitchDeg?: number;
  rangeM?: number;
}): NavigationOrbitOptions => ({
  direction,
  revolutionDurationSec: readOrbitRevolutionDurationSec(revolutionDurationSec),
  duration: durationMs as NavigationOrbitOptions["duration"],
  minPitchDeg,
  rangeM,
});

export const buildZoomOptions = ({
  zoomDelta,
  animate = true,
  durationMs = 250,
  minimumFovDeg,
  maximumFovDeg,
}: {
  zoomDelta?: number;
  animate?: boolean;
  durationMs?: number;
  minimumFovDeg?: number;
  maximumFovDeg?: number;
}): NavigationZoomOptions => {
  const resolvedFovBounds = readStoryCesiumFovBoundsDeg({
    minimumFovDeg,
    maximumFovDeg,
  });

  return {
    minimumFovRad: degToRadNumeric(resolvedFovBounds.minimumFovDeg)!,
    maximumFovRad: degToRadNumeric(resolvedFovBounds.maximumFovDeg)!,
    zoomDelta: readZoomDelta(zoomDelta),
    duration:
      animate &&
      typeof durationMs === "number" &&
      Number.isFinite(durationMs) &&
      durationMs > 0
        ? (durationMs as NavigationTransitionOptions["duration"])
        : (0 as NavigationTransitionOptions["duration"]),
  };
};

export const ZOOM_DELTA_ARG_TYPE = {
  name: "zoomDelta",
  options: ZOOM_DELTA_OPTIONS,
  control: {
    type: "inline-radio",
    labels: {
      // Storybook 8.5.3 still reorders these radio labels oddly in the manager UI.
      // Invisible U+2060 prefixes keep the visible order ascending without changing the shown glyphs.
      quarter: "\u2060¼",
      third: "\u2060\u2060⅓",
      half: "\u2060\u2060\u2060½",
      "two-thirds": "\u2060\u2060\u2060\u2060⅔",
      one: "\u2060\u2060\u2060\u2060\u20601",
      "one-and-half": "\u2060\u2060\u2060\u2060\u2060\u20601½",
      two: "\u2060\u2060\u2060\u2060\u2060\u2060\u20602",
      three: "\u2060\u2060\u2060\u2060\u2060\u2060\u2060\u20603",
    },
  },
} as const;

export const HOME_ANIMATE_ARG_TYPE = {
  name: "animate",
  control: { type: "boolean" },
} as const;

export const HOME_DURATION_ARG_TYPE = {
  name: "duration (ms)",
  control: { type: "range", min: 0, max: 3000, step: 50 },
  if: { arg: "homeAnimate" },
} as const;

export const ZOOM_ANIMATE_ARG_TYPE = {
  name: "animate",
  control: { type: "boolean" },
} as const;

export const ZOOM_DURATION_ARG_TYPE = {
  name: "duration (ms)",
  control: { type: "range", min: 0, max: 1200, step: 25 },
  if: { arg: "animate" },
} as const;

export const DOLLY_ZOOM_DURATION_ARG_TYPE = {
  name: "duration (ms)",
  control: { type: "range", min: 0, max: 4000, step: 25 },
  if: { arg: "animate" },
} as const;
