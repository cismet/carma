import type { FeatureKeyboardNavConfig, ResolvedNavConstants } from "./types";

/**
 * The one knob and the three constants behind it.
 *
 * A config author says how strictly navigation should follow the axis with a
 * single `sharpness` between 0 and 1; `coneAngleDeg` and `angleWeight` are
 * interpolated from it. Both remain settable on their own, and an explicit
 * value always wins, so a deployment can start from the preset and correct one
 * term. `anglePower` is not driven by `sharpness`.
 */

/**
 * Fuzzy is a wide cone with a weak penalty: whatever is physically near wins,
 * poor alignment tolerated — right for scattered points. Strict is a narrow
 * cone with a heavy penalty: navigation follows the axis and only accepts an
 * off-axis feature that is dramatically closer — right for gridded data.
 */
export const SHARPNESS_ANCHORS: readonly {
  sharpness: number;
  coneAngleDeg: number;
  angleWeight: number;
}[] = [
  { sharpness: 0, coneAngleDeg: 75, angleWeight: 1 },
  { sharpness: 0.5, coneAngleDeg: 60, angleWeight: 2.5 },
  { sharpness: 1, coneAngleDeg: 40, angleWeight: 6 },
];

export const DEFAULT_SHARPNESS = 0.5;
/** linear across the cone; 2 makes small deviations nearly free */
export const DEFAULT_ANGLE_POWER = 1;
export const DEFAULT_STRATEGY = "auto";
export const DEFAULT_FAN_DEG = 8;
export const DEFAULT_MIN_STEP_PX = 2;
export const DEFAULT_CROSS_LAYER = "prefer-current";
export const DEFAULT_CURRENT_LAYER_BONUS = 0.6;
export const DEFAULT_VERIFY_MAX_RETRIES = 3;
export const DEFAULT_EDGE_BEHAVIOR = "pan";
export const DEFAULT_PAN_STEP_FRACTION = 0.5;
export const DEFAULT_PAN_DURATION_MS = 300;
export const DEFAULT_EXPLAIN = "brief";
export const DEFAULT_EXPLAIN_MS = 1200;
/** how many interior-point dots `showOrigins` draws before it stops */
export const DEFAULT_MAX_ORIGIN_DOTS = 300;
/** grey-blue, so a possible origin never reads as the actual one */
export const DEFAULT_ORIGIN_DOT_COLOR = "#8a94a6";
export const DEFAULT_ORIGIN_DOT_OPACITY = 0.7;
export const DEFAULT_MAX_CANDIDATES = 4000;
export const DEFAULT_CANDIDATE_DEBOUNCE_MS = 200;

/** Pixels a Shift+arrow moves the map, matching MapLibre's own keyboard pan. */
export const SHIFT_PAN_PX = 100;

/**
 * Share of the viewport the selection is kept inside after a step. A selection
 * landing outside this rectangle is panned back in; zoom is never touched.
 */
export const KEEP_IN_VIEW_INSET_FRACTION = 0.12;

/** How long an edge pan is waited out before the retry gives up. */
export const EDGE_PAN_SETTLE_TIMEOUT_MS = 2000;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/**
 * `coneAngleDeg` and `angleWeight` for a sharpness, interpolated linearly
 * between the neighbouring anchors. Values outside 0..1 are clamped rather than
 * extrapolated: beyond the anchors the constants stop meaning anything.
 */
export const constantsForSharpness = (
  sharpness: number
): { coneAngleDeg: number; angleWeight: number } => {
  const value = clamp(sharpness, 0, 1);
  for (let index = 1; index < SHARPNESS_ANCHORS.length; index++) {
    const lower = SHARPNESS_ANCHORS[index - 1];
    const upper = SHARPNESS_ANCHORS[index];
    if (value <= upper.sharpness) {
      const span = upper.sharpness - lower.sharpness;
      const t = span === 0 ? 0 : (value - lower.sharpness) / span;
      return {
        coneAngleDeg: lerp(lower.coneAngleDeg, upper.coneAngleDeg, t),
        angleWeight: lerp(lower.angleWeight, upper.angleWeight, t),
      };
    }
  }
  const last = SHARPNESS_ANCHORS[SHARPNESS_ANCHORS.length - 1];
  return { coneAngleDeg: last.coneAngleDeg, angleWeight: last.angleWeight };
};

/**
 * The constants actually in force: derived from `sharpness`, then overridden
 * term by term. Setting both is legal and the explicit value wins, so
 * `{ sharpness: 1, coneAngleDeg: 55 }` is "strict, but with a wider cone" and
 * keeps the strict `angleWeight`.
 */
export const resolveNavConstants = (
  config: FeatureKeyboardNavConfig = {}
): ResolvedNavConstants => {
  const derived = constantsForSharpness(config.sharpness ?? DEFAULT_SHARPNESS);
  return {
    coneAngleDeg: config.coneAngleDeg ?? derived.coneAngleDeg,
    angleWeight: config.angleWeight ?? derived.angleWeight,
    anglePower: config.anglePower ?? DEFAULT_ANGLE_POWER,
  };
};
