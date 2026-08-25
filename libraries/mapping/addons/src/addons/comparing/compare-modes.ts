/**
 * The keys the built modes answer to.
 *
 * Shared because three places have to agree on them: the mode addon that
 * renders while its key is the active one, the picker in the control pane, and
 * the layout guards that keep a panel count and a mode from ending up in a
 * combination neither draws.
 */
export const COMPARE_MODE = {
  /** stripes side by side */
  swipeH: "swipe-h",
  /** stripes stacked */
  swipeV: "swipe-v",
  /** the 2x2 of clipped full-size panels */
  grid: "grid",
  /** real windows in a layout of their own, one map each */
  arena: "arena",
} as const;

/** what `CompareSwipe` draws: full-size panels, clipped rather than laid out */
export const SWIPE_MODES: readonly string[] = [
  COMPARE_MODE.swipeH,
  COMPARE_MODE.swipeV,
  COMPARE_MODE.grid,
];

/** every mode that is actually built, for checking a value that came from storage */
export const BUILT_COMPARE_MODES: readonly string[] = [
  ...SWIPE_MODES,
  COMPARE_MODE.arena,
];

/** the most windows the built modes split into: four is the 2x2 */
export const MAX_PANELS = 4;
