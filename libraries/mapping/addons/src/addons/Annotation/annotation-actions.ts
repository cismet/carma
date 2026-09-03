import { useCallback } from "react";

import { useAddonState } from "../../lib/AddonStateContext";
import type { AnnotationShape } from "./shape-tools";
import type { AnnotationGroup, AnnotationState } from "./types";

const FIRST_GROUPS: AnnotationGroup[] = [{ id: "annotation-1", locked: false }];

let sequence = FIRST_GROUPS.length;
const nextGroupId = () => `annotation-${(sequence += 1)}`;

export const reserveIdSequence = (upTo: number) => {
  sequence = Math.max(sequence, upTo);
};

const groupsOf = (state?: AnnotationState): AnnotationGroup[] =>
  state?.groups?.length ? state.groups : FIRST_GROUPS;

const activeIdOf = (state?: AnnotationState): string => {
  const groups = groupsOf(state);
  const id = state?.activeId;
  return id && groups.some((group) => group.id === id)
    ? id
    : groups[groups.length - 1].id;
};

/** shared by the overlay and its control, so both read one answer */
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
    (shape: AnnotationShape | null) =>
      setState((previous) =>
        previous?.shape === shape
          ? previous
          : { ...(previous ?? { isOn: false }), shape }
      ),
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

  const addGroup = useCallback(
    (band?: number) =>
      setState((previous) => {
        const group: AnnotationGroup = {
          id: nextGroupId(),
          locked: false,
          band,
        };
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

  /**
   * Hands a band to a drawing and opens it. Only ever used on an untouched
   * drawing, so nothing moves across the ground; see `AnnotationScene`.
   */
  const assignBand = useCallback(
    (id: string, band: number) =>
      setState((previous) => ({
        ...(previous ?? { isOn: false }),
        groups: groupsOf(previous).map((entry) =>
          entry.id === id
            ? { ...entry, band, locked: false }
            : { ...entry, locked: true }
        ),
        activeId: id,
      })),
    [setState]
  );

  /** the grid is cut once, from wherever the user drew first */
  const setZoomOrigin = useCallback(
    (zoom: number) =>
      setState((previous) =>
        previous?.zoomOrigin !== undefined
          ? previous
          : { ...(previous ?? { isOn: false }), zoomOrigin: zoom }
      ),
    [setState]
  );

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

  /**
   * Put the restored drawings in place and open the last one, so the pencil
   * works right away without a fresh drawing being added on every mount.
   */
  const hydrate = useCallback(
    (restored: AnnotationGroup[], origin?: number) =>
      setState((previous) => {
        if (restored.length === 0) {
          return previous ?? { isOn: false };
        }
        const groups = restored.map((entry, index) => ({
          ...entry,
          locked: index !== restored.length - 1,
        }));
        return {
          ...(previous ?? { isOn: false }),
          groups,
          activeId: groups[groups.length - 1].id,
          zoomOrigin: origin ?? previous?.zoomOrigin,
        };
      }),
    [setState]
  );

  const deleteGroup = useCallback(
    (id: string) =>
      setState((previous) => {
        const remaining = groupsOf(previous).filter((entry) => entry.id !== id);
        const kept = remaining.length
          ? remaining
          : [{ id: nextGroupId(), locked: false }];
        // the one that takes over is the one being worked on, so it is open
        const activeId = kept[kept.length - 1].id;
        return {
          ...(previous ?? { isOn: false }),
          groups: kept.map((entry) => ({
            ...entry,
            locked: entry.id !== activeId,
          })),
          activeId,
        };
      }),
    [setState]
  );

  const zoomToGroup = useCallback(
    (id: string) =>
      setState((previous) => ({
        ...(previous ?? { isOn: false }),
        zoomRequest: {
          id,
          version: (previous?.zoomRequest?.version ?? 0) + 1,
        },
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
    isLocked: activeGroup?.locked ?? false,
    shape: state?.shape === undefined ? "selection" : state.shape,
    undoVersion: state?.undoVersion ?? 0,
    redoVersion: state?.redoVersion ?? 0,
    zoomRequest: state?.zoomRequest,
    zoomOrigin: state?.zoomOrigin,
    toggle,
    endMode,
    setShape,
    undo,
    redo,
    addGroup,
    assignBand,
    setZoomOrigin,
    pickGroup,
    zoomToGroup,
    toggleLock,
    hydrate,
    deleteGroup,
  };
};
