import { useCallback, useMemo } from "react";

import { useAddonState, useRouteAddons } from "../../lib/AddonStateContext";
import {
  COMPARE_MODE,
  type CompareMode,
  type CompareOrientation,
} from "./compare-modes";
import {
  compareStateStorageKey,
  loadCompareState,
  saveCompareState,
} from "./comparing-storage";

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
   * Whether the user has taken the layout into their own hands, by picking a
   * panel count or ticking a cell. Until then the panel count follows the
   * number of layers on the map; afterwards it stays where it was put.
   */
  layoutTouched?: boolean;
};

export const COMPARE_STATE_DEFAULT: CompareState = {
  isOn: false,
  panelCount: 2,
  panelLabels: [],
  mode: COMPARE_MODE.swipe,
  orientation: "horizontal",
};

/**
 * One entry point for both writers, so the button and the modes cannot drift.
 *
 * The channel itself is session-only, so the stored state stands in front of it
 * until something is written in this session, and every write goes to
 * `localStorage` as well. Reading the store synchronously rather than hydrating
 * it in an effect matters here: an effect would let the comparison start from
 * its defaults for one render, which is long enough to build the panels twice.
 */
export const useComparingActions = () => {
  const [sessionState, setSessionState] = useAddonState("compareState");
  const addons = useRouteAddons();

  const storageKey = useMemo(() => compareStateStorageKey(addons), [addons]);
  const storedState = useMemo(() => loadCompareState(storageKey), [storageKey]);
  const state = sessionState ?? storedState;

  const setState = useCallback(
    (updater: (previous: CompareState) => CompareState) =>
      setSessionState((previous) => {
        const next = updater(
          previous ?? loadCompareState(storageKey) ?? COMPARE_STATE_DEFAULT
        );
        saveCompareState(storageKey, next);
        return next;
      }),
    [setSessionState, storageKey]
  );

  const isOn = state?.isOn ?? false;

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

  const setMode = useCallback(
    (next: CompareMode) => {
      setState((previous) => ({ ...previous, mode: next }));
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

  const setAssignments = useCallback(
    (next: CompareAssignments, forPanelCount: number) => {
      setState((previous) => ({
        ...previous,
        assignments: next,
        assignmentsPanelCount: forPanelCount,
      }));
    },
    [setState]
  );

  /** how many panels the comparison splits into, picked in the control pane */
  const setPanelCount = useCallback(
    (next: number) => {
      setState((previous) => ({
        ...previous,
        panelCount: next,
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
        if (current.layoutTouched || current.panelCount === next) {
          return current;
        }
        return { ...current, panelCount: next };
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

  return {
    /**
     * Whether anything is known about the comparison yet, from this session or
     * from storage. What it answers is whether a mode may still seed a default:
     * once there is a state, its mode was either chosen or restored, and either
     * way it is not a mode addon's to overwrite on mount.
     */
    hasState: state !== undefined,
    isOn,
    setOn,
    toggle,
    panelCount,
    setPanelCount,
    suggestPanelCount,
    panelLabels,
    mode,
    setMode,
    orientation,
    setOrientation,
    setLayout,
    assignments,
    assignmentsPanelCount: state?.assignmentsPanelCount,
    setAssignments,
    setAssigned,
    setAssignedEverywhere,
  };
};
