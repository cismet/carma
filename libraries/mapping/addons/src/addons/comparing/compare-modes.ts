/**
 * The two things a comparison layout is made of, kept apart.
 *
 * The mode is who draws the panels, the orientation is which way they are laid
 * out, and the panel count is how many there are. They were one key once
 * (`swipe-h`, `swipe-v`, `grid`, `arena`), which meant picking an orientation
 * also picked a renderer: asking for stacked windows landed back in the swipe.
 *
 * Shared because three places have to agree on them: the mode addon that
 * renders while its key is the active one, the picker in the control pane, and
 * the layout each of them derives.
 */
export const COMPARE_MODE = {
  /** full-size panels clipped against each other, dividers to drag */
  swipe: "swipe",
  /** real windows in a layout of their own, one map each */
  arena: "arena",
} as const;

export type CompareMode = (typeof COMPARE_MODE)[keyof typeof COMPARE_MODE];

/** every mode that is actually built, for checking a value that came from storage */
export const BUILT_COMPARE_MODES: readonly string[] = [
  COMPARE_MODE.swipe,
  COMPARE_MODE.arena,
];

export type CompareOrientation = "horizontal" | "vertical";

export const COMPARE_ORIENTATION: readonly CompareOrientation[] = [
  "horizontal",
  "vertical",
];

/** the most windows the built modes split into: four is the 2x2 */
export const MAX_PANELS = 4;

/**
 * Whether the orientation is worth offering at this panel count.
 *
 * Four panels are the 2x2 in either mode, which is as wide as it is high, so
 * there is no axis left to choose. Stripes for two and three run along one.
 */
export const orientationApplies = (panelCount: number): boolean =>
  panelCount < MAX_PANELS;

/**
 * What the single-key modes meant, so a state stored by an older build comes
 * back as the same layout rather than as the default one. `grid` carried its
 * panel count in the key; the count is stored beside it and was four whenever
 * grid was the mode, so it needs nothing here.
 */
const LEGACY_MODES: Record<
  string,
  { mode: CompareMode; orientation: CompareOrientation }
> = {
  "swipe-h": { mode: COMPARE_MODE.swipe, orientation: "horizontal" },
  "swipe-v": { mode: COMPARE_MODE.swipe, orientation: "vertical" },
  grid: { mode: COMPARE_MODE.swipe, orientation: "horizontal" },
  arena: { mode: COMPARE_MODE.arena, orientation: "horizontal" },
};

/** a stored mode and orientation, whichever build wrote them */
export const readModeAndOrientation = (
  mode: unknown,
  orientation: unknown
): { mode: CompareMode; orientation: CompareOrientation } => {
  const legacy = typeof mode === "string" ? LEGACY_MODES[mode] : undefined;
  return {
    mode:
      typeof mode === "string" && BUILT_COMPARE_MODES.includes(mode)
        ? (mode as CompareMode)
        : legacy?.mode ?? COMPARE_MODE.swipe,
    orientation:
      orientation === "horizontal" || orientation === "vertical"
        ? orientation
        : legacy?.orientation ?? "horizontal",
  };
};
