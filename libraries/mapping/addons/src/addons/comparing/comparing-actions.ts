import { useCallback, useMemo } from "react";

import { useAddonState } from "../../lib/AddonStateContext";
import {
  clampPanelCount,
  clampSpyglassRadius,
  COMPARE_MODE,
  SPYGLASS_RADIUS_DEFAULT,
  type CompareMode,
  type CompareOrientation,
} from "./compare-modes";

/**
 * Whether the comparison is running, shared between the button that switches it
 * and the mode addons that render the panels.
 *
 * Kept in the addon state rather than in each mode addon so a route can carry
 * several modes and still have one switch, and so the state dies with the route
 * the way every other channel does.
 */
/** which panels a block is shown in, keyed by `carmaLayerId` */
export type CompareAssignments = Record<string, number[]>;

export type CompareState = {
  isOn: boolean;
  /** how many panels the running mode splits the window into */
  panelCount: number;
  /** panel headings from the running mode, so they cannot disagree with the screen */
  panelLabels: string[];
  /** who draws the panels, picked in the control pane */
  mode: CompareMode;
  /**
   * Which way the panels are laid out. Independent of the mode: both of them
   * draw two or three panels along either axis, and four as the 2x2, where the
   * orientation is carried but says nothing.
   */
  orientation: CompareOrientation;
  /**
   * The assignment. Undefined until the layers are known, which is when it is
   * seeded from the implicit rule; the pane edits it from there.
   */
  assignments?: CompareAssignments;
  /**
   * The panel count the assignment was seeded for. A different count means the
   * assignment says nothing about the panels that now exist, so it is seeded
   * again rather than carried over half-applied.
   */
  assignmentsPanelCount?: number;
  /**
   * Whether the assignment names every block that belongs in a panel. Set
   * when a definition is launched (a shared or restored comparison): a block
   * on this map that the definition does not name was not part of the
   * comparison, so the next reconcile leaves it out of every panel instead of
   * putting it in all of them the way a block added while comparing is. That
   * reconcile clears it.
   */
  assignmentsClosed?: boolean;
  /**
   * Whether the user has taken the layout into their own hands, by picking a
   * panel count or ticking a cell. Until then the panel count follows the
   * number of layers on the map; afterwards it stays where it was put.
   */
  layoutTouched?: boolean;
  /**
   * How wide the lens is, in px. Only the spyglass mode reads it, but it is
   * kept here with the rest so wheeling the lens larger survives a switch to
   * another mode and back, and a reload.
   */
  spyglassRadius?: number;
};

export const COMPARE_STATE_DEFAULT: CompareState = {
  isOn: false,
  panelCount: 2,
  panelLabels: [],
  mode: COMPARE_MODE.swipe,
  orientation: "horizontal",
  spyglassRadius: SPYGLASS_RADIUS_DEFAULT,
};

/**
 * What describes a comparison apart from the layers it compares: the part of
 * the state a link or a persisted row can carry. The layer-bar row embeds it
 * in its `tools`, the way a time-series row embeds its series, and
 * `startComparison` launches it again. Runtime readouts (`panelLabels`,
 * `isOn`) are not part of it, they come back as soon as a mode mounts.
 */
export type CompareDefinition = {
  mode: CompareMode;
  orientation: CompareOrientation;
  panelCount: number;
  /** keyed by layer id; left out, the implicit rule seeds it from the layers */
  assignments?: CompareAssignments;
  spyglassRadius?: number;
};

/** the definition a state currently holds */
export const toCompareDefinition = (state: CompareState): CompareDefinition => ({
  mode: state.mode,
  orientation: state.orientation,
  panelCount: state.panelCount,
  ...(state.assignments ? { assignments: state.assignments } : {}),
  ...(state.spyglassRadius !== undefined
    ? { spyglassRadius: state.spyglassRadius }
    : {}),
});

const sameAssignments = (
  a: CompareAssignments | undefined,
  b: CompareAssignments | undefined
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => {
      const other = b[key];
      return (
        other !== undefined &&
        other.length === a[key].length &&
        a[key].every((panel, i) => panel === other[i])
      );
    })
  );
};

const holdsDefinition = (
  state: CompareState,
  def: CompareDefinition
): boolean =>
  state.mode === def.mode &&
  state.orientation === def.orientation &&
  state.panelCount === def.panelCount &&
  (def.assignments === undefined ||
    sameAssignments(state.assignments, def.assignments)) &&
  (def.spyglassRadius === undefined ||
    state.spyglassRadius === def.spyglassRadius);

/**
 * One entry point for both writers, so the button and the modes cannot drift.
 *
 * The channel is session-only. What survives a reload is the layer-bar row,
 * which carries the definition in its `tools` and launches it again through
 * `startComparison` (see `getComparingRowSeed`).
 */
export const useComparingActions = () => {
  const [state, setSessionState] = useAddonState("compareState");

  const setState = useCallback(
    (updater: (previous: CompareState) => CompareState) =>
      setSessionState((previous) => updater(previous ?? COMPARE_STATE_DEFAULT)),
    [setSessionState]
  );

  const isOn = state?.isOn ?? false;

  /**
   * A mode addon's config for the channel, applied only while nothing is
   * known yet. Anything already there was chosen in this session or launched
   * from a row, and neither is a mode addon's to overwrite on mount. A
   * functional update, so it stays a no-op even when a row's launch is
   * queued in the same commit ahead of it.
   */
  const seedDefaults = useCallback(
    (defaults: Partial<Pick<CompareState, "mode" | "orientation" | "spyglassRadius">>) => {
      setSessionState((previous) =>
        previous ?? { ...COMPARE_STATE_DEFAULT, ...defaults }
      );
    },
    [setSessionState]
  );

  const setOn = useCallback(
    (next: boolean) => {
      setState((previous) => ({ ...previous, isOn: next }));
    },
    [setState]
  );

  const toggle = useCallback(() => {
    setState((previous) => ({ ...previous, isOn: !previous.isOn }));
  }, [setState]);

  const panelCount = state?.panelCount ?? COMPARE_STATE_DEFAULT.panelCount;
  const panelLabels = state?.panelLabels ?? COMPARE_STATE_DEFAULT.panelLabels;
  const mode = state?.mode ?? COMPARE_STATE_DEFAULT.mode;
  const orientation = state?.orientation ?? COMPARE_STATE_DEFAULT.orientation;
  const assignments = state?.assignments;
  const spyglassRadius = state?.spyglassRadius ?? SPYGLASS_RADIUS_DEFAULT;

  /** the running mode describing its own layout, so the pane's headings match */
  const setLayout = useCallback(
    (count: number, labels: string[]) => {
      setState((previous) => {
        const current = previous;
        if (
          current.panelCount === count &&
          current.panelLabels.length === labels.length &&
          current.panelLabels.every((label, i) => label === labels[i])
        ) {
          return current;
        }
        return { ...current, panelCount: count, panelLabels: labels };
      });
    },
    [setState]
  );

  /**
   * The mode, and with it the panel count when the new mode cannot draw the
   * one that is set.
   *
   * Moving the count rather than refusing the mode is what keeps the picker
   * free of dead ends: the lens is a two-panel mode, and a user sitting at
   * three panels would otherwise have to know to reduce the count first.
   */
  const setMode = useCallback(
    (next: CompareMode) => {
      setState((previous) => ({
        ...previous,
        mode: next,
        panelCount: clampPanelCount(next, previous.panelCount),
      }));
    },
    [setState]
  );

  /** the other axis, which leaves the mode where it is */
  const setOrientation = useCallback(
    (next: CompareOrientation) => {
      setState((previous) => ({ ...previous, orientation: next }));
    },
    [setState]
  );

  /** the lens's size, written by wheeling over it */
  const setSpyglassRadius = useCallback(
    (next: number) => {
      setState((previous) => {
        const radius = clampSpyglassRadius(next);
        return previous.spyglassRadius === radius
          ? previous
          : { ...previous, spyglassRadius: radius };
      });
    },
    [setState]
  );

  /** the reconciled assignment, which covers every block on the map by now */
  const setAssignments = useCallback(
    (next: CompareAssignments, forPanelCount: number) => {
      setState((previous) => ({
        ...previous,
        assignments: next,
        assignmentsPanelCount: forPanelCount,
        assignmentsClosed: false,
      }));
    },
    [setState]
  );

  /**
   * How many panels the comparison splits into, picked in the control pane.
   *
   * Held to what the running mode can draw, so the pair stays possible from
   * this side as well. The pane disables the counts the mode rules out, so this
   * only catches a count arriving from somewhere else.
   */
  const setPanelCount = useCallback(
    (next: number) => {
      setState((previous) => ({
        ...previous,
        panelCount: clampPanelCount(previous.mode, next),
        layoutTouched: true,
      }));
    },
    [setState]
  );

  /** the same count, but from the heuristic, which must not claim the layout */
  const suggestPanelCount = useCallback(
    (next: number) => {
      setState((previous) => {
        const current = previous;
        const wanted = clampPanelCount(current.mode, next);
        if (current.layoutTouched || current.panelCount === wanted) {
          return current;
        }
        return { ...current, panelCount: wanted };
      });
    },
    [setState]
  );

  /** one cell of the pane's matrix */
  const setAssigned = useCallback(
    (key: string, panel: number, assigned: boolean) => {
      setState((previous) => {
        const current = previous;
        const panels = current.assignments?.[key] ?? [];
        const next = assigned
          ? panels.includes(panel)
            ? panels
            : [...panels, panel].sort((a, b) => a - b)
          : panels.filter((entry) => entry !== panel);
        return {
          ...current,
          assignments: { ...(current.assignments ?? {}), [key]: next },
          layoutTouched: true,
        };
      });
    },
    [setState]
  );

  /**
   * Back to the layout the layers imply.
   *
   * Three things have to go for the seed to run again: the assignment itself,
   * the count it was made for, and the mark that says the user took the layout
   * over. With all three gone the count follows the number of blocks on the map
   * once more and every block lands in the panel the implicit rule gives it,
   * which is the state a comparison starts in.
   */
  const resetLayout = useCallback(() => {
    setState((previous) => ({
      ...previous,
      assignments: undefined,
      assignmentsPanelCount: undefined,
      layoutTouched: false,
    }));
  }, [setState]);

  /**
   * Launches a definition: what a row restored from the persisted stack or
   * brought in by a shared link carries. The layout counts as the user's
   * (`layoutTouched`), so the heuristic does not move the panel count away
   * from what was shared. A channel that already holds the definition is left
   * alone, so launching the running comparison again changes nothing, with
   * one exception: the layout still becomes the definition's. A comparison
   * just saved as a workflow layer is exactly this case (the group carries
   * what the channel runs), and without the claim the heuristic would move
   * the panel count and reseed the assignment the next time a layer is added,
   * turning the saved two-panel comparison into a three-way one.
   */
  const startComparison = useCallback(
    (def: CompareDefinition) => {
      setState((previous) => {
        if (previous.isOn && holdsDefinition(previous, def)) {
          return previous.layoutTouched
            ? previous
            : { ...previous, layoutTouched: true };
        }
        const panelCount = clampPanelCount(def.mode, def.panelCount);
        return {
          ...previous,
          isOn: true,
          mode: def.mode,
          orientation: def.orientation,
          panelCount,
          layoutTouched: true,
          ...(def.assignments
            ? {
                assignments: def.assignments,
                assignmentsPanelCount: panelCount,
                assignmentsClosed: true,
              }
            : {}),
          ...(def.spyglassRadius !== undefined
            ? { spyglassRadius: clampSpyglassRadius(def.spyglassRadius) }
            : {}),
        };
      });
    },
    [setState]
  );

  /** the same block in or out of every panel at once, for the background */
  const setAssignedEverywhere = useCallback(
    (key: string, assigned: boolean) => {
      setState((previous) => {
        const current = previous;
        const next = assigned
          ? Array.from({ length: current.panelCount }, (_, panel) => panel)
          : [];
        return {
          ...current,
          assignments: { ...(current.assignments ?? {}), [key]: next },
          layoutTouched: true,
        };
      });
    },
    [setState]
  );

  // one object per state, so a row memoised on it does not go stale every render
  const definition = useMemo(
    () => (state ? toCompareDefinition(state) : undefined),
    [state]
  );

  /** whether this definition is the comparison the channel currently runs */
  const isComparisonRunning = useCallback(
    (def: CompareDefinition): boolean =>
      state !== undefined && state.isOn && holdsDefinition(state, def),
    [state]
  );

  return {
    /** the definition the channel holds now, for the row to carry */
    definition,
    seedDefaults,
    isOn,
    setOn,
    toggle,
    startComparison,
    isComparisonRunning,
    panelCount,
    setPanelCount,
    suggestPanelCount,
    panelLabels,
    mode,
    setMode,
    orientation,
    setOrientation,
    spyglassRadius,
    setSpyglassRadius,
    setLayout,
    assignments,
    assignmentsPanelCount: state?.assignmentsPanelCount,
    assignmentsClosed: state?.assignmentsClosed ?? false,
    setAssignments,
    setAssigned,
    setAssignedEverywhere,
    resetLayout,
  };
};
