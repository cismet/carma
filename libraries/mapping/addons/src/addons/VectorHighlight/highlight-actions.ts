import { useCallback } from "react";

import { useMapHighlight } from "@carma-mapping/contexts";
import type { DrawShape, RectSize } from "@carma-mapping/engines/maplibre";

import { useAddonState } from "../../lib/AddonStateContext";
import { DEFAULT_BUFFER_WIDTH, DEFAULT_SHAPES } from "./shapes";
import {
  MONOCHROME_COLOR,
  OPERATION_COLORS,
  type HighlightOperation,
} from "./operations";

/**
 * Whether a plain map click belongs to the highlight tool rather than to the
 * map's own click-to-select.
 *
 * Only the line does this: it is placed click by click, while the other shapes
 * are drags, and a drag never produces a click at all. Hosts pass this into
 * whatever guards their selection, or every vertex also selects the feature
 * underneath it.
 */
export const useHighlightOwnsMapClicks = (): boolean => {
  const { isOn, shape } = useHighlightModeActions();
  return isOn && shape === "line";
};

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
  const appliedBuffer = mode?.appliedBuffer ?? 0;
  const shrinkLimit = mode?.shrinkLimit ?? 0;
  /** How far down the step may go: the limit is for the total, and part of it
   *  is already applied, so the rest is what the next step may still take.
   *  Enforced where the step is written, never on the way out — a value shown
   *  here that the addon does not use would be a lie about what apply does. */
  const bufferFloor = shrinkLimit - appliedBuffer;
  const shapeBuffer = mode?.shapeBuffer ?? DEFAULT_BUFFER_WIDTH;
  const bufferEnabled = mode?.bufferEnabled ?? false;
  const hasLastShape = mode?.hasLastShape ?? false;
  const bufferPanelOpen = mode?.bufferPanelOpen ?? false;
  const lastShapeShown = mode?.lastShapeShown ?? false;
  const shapeEmpty = mode?.shapeEmpty ?? false;

  /**
   * Open is "buffer on": it puts the remembered shape back on the map, grown by
   * the width, to be judged before it runs. Closing switches the buffer off and
   * takes the preview down.
   *
   * The step starts at 0 every time the panel is opened, so what first appears
   * is the shape as it stands — the width is dialled in from there.
   */
  const setBufferPanelOpen = useCallback(
    (open: boolean) =>
      setMode((previous) =>
        open
          ? {
              ...(previous ?? { isOn: false }),
              bufferPanelOpen: true,
              bufferEnabled: true,
              shapeBuffer: 0,
              showShapeVersion: (previous?.showShapeVersion ?? 0) + 1,
            }
          : {
              ...(previous ?? { isOn: false }),
              bufferPanelOpen: false,
              bufferEnabled: false,
              hideShapeVersion: (previous?.hideShapeVersion ?? 0) + 1,
            }
      ),
    [setMode]
  );

  /**
   * Runs the previewed shape at the current width. `bufferEnabled` stays on —
   * the width must still apply while the shape runs; the addon switches it off
   * once the manager reports the shape finished.
   */
  const applyBufferedShape = useCallback(
    () =>
      setMode((previous) => ({
        ...(previous ?? { isOn: false }),
        bufferPanelOpen: false,
        applyShapeVersion: (previous?.applyShapeVersion ?? 0) + 1,
      })),
    [setMode]
  );

  /** The last-shape button: puts the remembered shape back on the map, and
   *  takes it down again. Clicking the shape itself is what runs it. */
  const toggleLastShape = useCallback(
    () =>
      setMode((previous) => {
        if (previous?.lastShapeShown) {
          return {
            ...previous,
            hideShapeVersion: (previous.hideShapeVersion ?? 0) + 1,
          };
        }
        // shown the way it last ran: an applied width belongs to the shape, so
        // it is previewed with that width and no step on top of it
        const applied = previous?.appliedBuffer ?? 0;
        return {
          ...(previous ?? { isOn: false }),
          showShapeVersion: (previous?.showShapeVersion ?? 0) + 1,
          ...(applied !== 0 ? { bufferEnabled: true, shapeBuffer: 0 } : null),
        };
      }),
    [setMode]
  );

  const setShapeBuffer = useCallback(
    (next: number) =>
      setMode((previous) => ({
        ...(previous ?? { isOn: false }),
        shapeBuffer: Math.max(
          next,
          (previous?.shrinkLimit ?? 0) - (previous?.appliedBuffer ?? 0)
        ),
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
    setMode((previous) => ({
      ...(previous ?? {}),
      isOn: false,
      bufferPanelOpen: false,
      bufferEnabled: false,
    }));
    clearHighlights();
    setHighlightingActive(false);
  }, [setMode, clearHighlights, setHighlightingActive]);

  /** empties the selection but stays in the mode; dropping `highlightingActive`
   *  is what lifts the dim, which `clearHighlights` alone does not do */
  const clear = useCallback(() => {
    clearHighlights();
    setHighlightingActive(false);
    cancelLine();
    setBufferPanelOpen(false);
  }, [clearHighlights, setHighlightingActive, cancelLine, setBufferPanelOpen]);

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
        // the buffer step belongs to the shape it was opened for
        bufferPanelOpen: false,
        bufferEnabled: false,
        hideShapeVersion: (previous?.hideShapeVersion ?? 0) + 1,
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
    canClear: highlightingActive,
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
    shapeBuffer,
    appliedBuffer,
    setShapeBuffer,
    bufferEnabled,
    cancelLine,
    hasLastShape,
    lastShapeShown,
    shapeEmpty,
    shrinkLimit,
    bufferFloor,
    bufferPanelOpen,
    setBufferPanelOpen,
    applyBufferedShape,
    toggleLastShape,
  };
};
