import { useCallback } from "react";

import { useMapHighlight } from "@carma-mapping/contexts";
import {
  DEFAULT_LINE_BUFFER,
  type DrawShape,
  type RectSize,
} from "@carma-mapping/engines/maplibre";

import { useAddonState } from "../../lib/AddonStateContext";
import { DEFAULT_SHAPES } from "./shapes";
import {
  MONOCHROME_COLOR,
  OPERATION_COLORS,
  type HighlightOperation,
} from "./operations";

/**
 * Shared by the headless addon and every piece of UI, so "end the mode" and
 * "clear" cannot drift apart. The addon's entry point for highlighting: use
 * these instead of `MapHighlightContext`.
 */
export const useHighlightModeActions = () => {
  const [mode, setMode] = useAddonState("highlightMode");
  const {
    highlightingActive,
    setHighlightingActive,
    clearHighlights,
    highlightByIds,
  } = useMapHighlight();

  const shapes = mode?.availableShapes ?? DEFAULT_SHAPES;
  const lineBuffer = mode?.lineBuffer ?? DEFAULT_LINE_BUFFER;
  const hasPendingLine = mode?.hasPendingLine ?? false;

  const setLineBuffer = useCallback(
    (next: number) =>
      setMode((previous) => ({
        ...(previous ?? { isOn: false }),
        lineBuffer: next,
      })),
    [setMode]
  );

  /** buffers the finished line and selects in that corridor */
  const applyLine = useCallback(
    () =>
      setMode((previous) => ({
        ...(previous ?? { isOn: false }),
        applyLineVersion: (previous?.applyLineVersion ?? 0) + 1,
      })),
    [setMode]
  );

  const cancelLine = useCallback(
    () =>
      setMode((previous) => ({
        ...(previous ?? { isOn: false }),
        cancelLineVersion: (previous?.cancelLineVersion ?? 0) + 1,
      })),
    [setMode]
  );

  const startMode = useCallback(
    () => setMode((previous) => ({ ...(previous ?? {}), isOn: true })),
    [setMode]
  );

  const endMode = useCallback(() => {
    setMode((previous) => ({ ...(previous ?? {}), isOn: false }));
    clearHighlights();
    setHighlightingActive(false);
  }, [setMode, clearHighlights, setHighlightingActive]);

  /** empties the selection but stays in the mode; dropping `highlightingActive`
   *  is what lifts the dim, which `clearHighlights` alone does not do */
  const clear = useCallback(() => {
    clearHighlights();
    setHighlightingActive(false);
    cancelLine();
  }, [clearHighlights, setHighlightingActive, cancelLine]);

  /**
   * Light the features whose `property` (default `"id"`) is one of `ids`.
   *
   * 1. `highlightByIds` only records criteria and bumps `highlightVersion`.
   * 2. `setHighlightingActive` is what makes them visible — without it the apply
   *    effect returns early and the dim stays off.
   * 3. `useMapHighlighting` then scans the features and writes
   *    `feature-state.highlighted`; `dim-controller` fades the rest.
   *
   * Criteria are additive, hence the clear unless `append`.
   */
  const highlightIds = useCallback(
    (ids: string[], options?: { property?: string; append?: boolean }) => {
      if (ids.length === 0) return;
      if (!options?.append) clearHighlights();
      highlightByIds(ids, { property: options?.property });
      setHighlightingActive(true);
    },
    [clearHighlights, highlightByIds, setHighlightingActive]
  );

  const setShape = useCallback(
    (next: DrawShape) =>
      setMode((previous) => ({
        ...(previous ?? { isOn: false }),
        shape: next,
      })),
    [setMode]
  );

  const monochrome = mode?.monochrome ?? false;
  const operationColors = mode?.operationColors;
  const colorForOperation = useCallback(
    (next: HighlightOperation) =>
      monochrome
        ? MONOCHROME_COLOR
        : operationColors?.[next] ?? OPERATION_COLORS[next],
    [monochrome, operationColors]
  );

  const showOperations = mode?.showOperations ?? true;
  const showShapes = mode?.showShapes ?? true;

  const toggleOperations = useCallback(
    () =>
      setMode((previous) => ({
        ...(previous ?? { isOn: false }),
        showOperations: !(previous?.showOperations ?? true),
      })),
    [setMode]
  );

  const toggleShapes = useCallback(
    () =>
      setMode((previous) => ({
        ...(previous ?? { isOn: false }),
        showShapes: !(previous?.showShapes ?? true),
      })),
    [setMode]
  );

  const setOperation = useCallback(
    (next: HighlightOperation) =>
      setMode((previous) => ({
        ...(previous ?? { isOn: false }),
        operation: next,
      })),
    [setMode]
  );

  const setCircleRadius = useCallback(
    (next: number) =>
      setMode((previous) => ({
        ...(previous ?? { isOn: false }),
        circleRadius: next,
      })),
    [setMode]
  );

  const setRectSize = useCallback(
    (next: RectSize) =>
      setMode((previous) => ({
        ...(previous ?? { isOn: false }),
        rectSize: next,
      })),
    [setMode]
  );

  return {
    mode,
    setMode,
    shapes,
    shape: mode?.shape ?? shapes[0] ?? "lasso",
    /** the button started it, or a modifier gesture did */
    isOn: (mode?.isOn ?? false) || highlightingActive,
    modeActive: mode?.isOn ?? false,
    highlightingActive,
    // an unapplied line is something to take back as well
    canClear: highlightingActive || hasPendingLine,
    startMode,
    endMode,
    clear,
    highlightIds,
    setShape,
    operation: mode?.operation ?? "add",
    setOperation,
    monochrome,
    colorForOperation,
    showOperations,
    showShapes,
    toggleOperations,
    toggleShapes,
    setCircleRadius,
    setRectSize,
    lineBuffer,
    setLineBuffer,
    hasPendingLine,
    applyLine,
    cancelLine,
  };
};
