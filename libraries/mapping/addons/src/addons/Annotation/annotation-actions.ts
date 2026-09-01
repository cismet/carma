import { useCallback } from "react";

import { useAddonState } from "../../lib/AddonStateContext";
import type { AnnotationShape } from "./shape-tools";
import type { AnnotationGroup, AnnotationState } from "./types";

/** the drawing a session starts on */
const FIRST_GROUPS: AnnotationGroup[] = [{ id: "annotation-1", locked: false }];

let sequence = FIRST_GROUPS.length;
const nextGroupId = () => `annotation-${(sequence += 1)}`;

const groupsOf = (state?: AnnotationState): AnnotationGroup[] =>
  state?.groups?.length ? state.groups : FIRST_GROUPS;

/** the newest drawing, unless the state names one that still exists */
const activeIdOf = (state?: AnnotationState): string => {
  const groups = groupsOf(state);
  const id = state?.activeId;
  return id && groups.some((group) => group.id === id)
    ? id
    : groups[groups.length - 1].id;
};

/**
 * Shared by the overlay, its control and its layer row, so all three read one
 * answer. Callbacks must stay stable: the layer row puts them in the host's
 * layer snapshot, and a new identity per render would loop the update.
 */
export const useAnnotationActions = () => {
  const [state, setState] = useAddonState("annotationMode");

  const groups = groupsOf(state);
  const activeId = activeIdOf(state);
  const activeGroup = groups.find((group) => group.id === activeId);

  const toggle = useCallback(
    () =>
      setState((previous) => ({
        ...(previous ?? {}),
        isOn: !(previous?.isOn ?? false),
      })),
    [setState]
  );

  const endMode = useCallback(
    () => setState((previous) => ({ ...(previous ?? {}), isOn: false })),
    [setState]
  );

  const setShape = useCallback(
    (shape: AnnotationShape) =>
      setState((previous) => ({ ...(previous ?? { isOn: false }), shape })),
    [setState]
  );

  const undo = useCallback(
    () =>
      setState((previous) => ({
        ...(previous ?? { isOn: false }),
        undoVersion: (previous?.undoVersion ?? 0) + 1,
      })),
    [setState]
  );

  const redo = useCallback(
    () =>
      setState((previous) => ({
        ...(previous ?? { isOn: false }),
        redoVersion: (previous?.redoVersion ?? 0) + 1,
      })),
    [setState]
  );

  /** New drawing on a fresh anchor; the others lock, only one is editable. */
  const addGroup = useCallback(
    () =>
      setState((previous) => {
        const group: AnnotationGroup = { id: nextGroupId(), locked: false };
        return {
          ...(previous ?? { isOn: false }),
          groups: [
            ...groupsOf(previous).map((entry) => ({ ...entry, locked: true })),
            group,
          ],
          activeId: group.id,
        };
      }),
    [setState]
  );

  /** Reactivate an older drawing: it unlocks, the others lock. */
  const pickGroup = useCallback(
    (id: string) =>
      setState((previous) => ({
        ...(previous ?? { isOn: false }),
        groups: groupsOf(previous).map((entry) => ({
          ...entry,
          locked: entry.id !== id,
        })),
        activeId: id,
      })),
    [setState]
  );

  const toggleLock = useCallback(
    () =>
      setState((previous) => {
        const id = activeIdOf(previous);
        return {
          ...(previous ?? { isOn: false }),
          groups: groupsOf(previous).map((entry) =>
            entry.id === id ? { ...entry, locked: !entry.locked } : entry
          ),
          activeId: id,
        };
      }),
    [setState]
  );

  return {
    isOn: state?.isOn ?? false,
    groups,
    activeId,
    /** whether the active drawing is locked */
    isLocked: activeGroup?.locked ?? false,
    shape: state?.shape ?? "selection",
    undoVersion: state?.undoVersion ?? 0,
    redoVersion: state?.redoVersion ?? 0,
    toggle,
    endMode,
    setShape,
    undo,
    redo,
    addGroup,
    pickGroup,
    toggleLock,
  };
};
