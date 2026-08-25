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
  /** one map everywhere, the other inside a circle the user drags around */
  spyglass: "spyglass",
} as const;

export type CompareMode = (typeof COMPARE_MODE)[keyof typeof COMPARE_MODE];

/** every mode that is actually built, for checking a value that came from storage */
export const BUILT_COMPARE_MODES: readonly string[] = [
  COMPARE_MODE.swipe,
  COMPARE_MODE.arena,
  COMPARE_MODE.spyglass,
];

export type CompareOrientation = "horizontal" | "vertical";

export const COMPARE_ORIENTATION: readonly CompareOrientation[] = [
  "horizontal",
  "vertical",
];

/** the most windows the built modes split into: four is the 2x2 */
export const MAX_PANELS = 4;

/**
 * The panel counts each mode means anything at.
 *
 * Swipe and arena divide a window into any of them. The lens is a circle of one
 * map cut into another, which is two panels and can be nothing else: a third
 * has nowhere to go.
 */
export const MODE_PANEL_COUNTS: Record<CompareMode, readonly number[]> = {
  [COMPARE_MODE.swipe]: [2, 3, 4],
  [COMPARE_MODE.arena]: [2, 3, 4],
  [COMPARE_MODE.spyglass]: [2],
};

export const panelCountApplies = (
  mode: CompareMode,
  panelCount: number
): boolean => MODE_PANEL_COUNTS[mode].includes(panelCount);

/**
 * The nearest count this mode can actually draw.
 *
 * Every writer of either axis runs the pair through here, so a mode and a count
 * that cannot go together never reach a renderer: picking the lens at three
 * panels moves the count rather than leaving a mode on screen that has no way
 * to show what it was asked for.
 */
export const clampPanelCount = (
  mode: CompareMode,
  panelCount: number
): number => {
  const counts = MODE_PANEL_COUNTS[mode];
  if (counts.includes(panelCount)) {
    return panelCount;
  }
  return counts.reduce((best, count) =>
    Math.abs(count - panelCount) < Math.abs(best - panelCount) ? count : best
  );
};

/**
 * Whether the orientation is worth offering for this mode at this panel count.
 *
 * Four panels are the 2x2 in either of the dividing modes, which is as wide as
 * it is high, so there is no axis left to choose. Stripes for two and three run
 * along one. The lens has no axis at all: it is a circle, and where it sits is
 * dragged rather than picked.
 */
export const orientationApplies = (
  panelCount: number,
  mode?: CompareMode
): boolean => mode !== COMPARE_MODE.spyglass && panelCount < MAX_PANELS;

/**
 * How wide the lens is, in px, and how far it can be taken.
 *
 * The range is the one `SpyglassOverlay` scrolls through, repeated here because
 * a radius that came back from storage has to be held to the same bounds before
 * anything is drawn with it.
 */
export const SPYGLASS_RADIUS_DEFAULT = 180;
export const SPYGLASS_RADIUS_MIN = 60;
export const SPYGLASS_RADIUS_MAX = 400;

export const clampSpyglassRadius = (radius: number): number =>
  Math.min(SPYGLASS_RADIUS_MAX, Math.max(SPYGLASS_RADIUS_MIN, radius));

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
