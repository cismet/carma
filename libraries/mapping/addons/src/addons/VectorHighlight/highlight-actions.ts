import { useCallback } from "react";

import { useMapHighlight } from "@carma-mapping/contexts";
import type { DrawShape, RectSize } from "@carma-mapping/engines/maplibre";

import { useAddonState } from "../../lib/AddonStateContext";
import { DEFAULT_SHAPES } from "./shapes";
import {
  MONOCHROME_COLOR,
  OPERATION_COLORS,
  type HighlightOperation,
} from "./operations";

/**
 * Shared by the headless addon and every piece of UI, so "end the mode" and
 * "clear" cannot drift apart between them. Internal: not part of the library's
 * public surface.
 */
export const useHighlightModeActions = () => {
  const [mode, setMode] = useAddonState("highlightMode");
  const { highlightingActive, setHighlightingActive, clearHighlights } =
    useMapHighlight();

  const shapes = mode?.availableShapes ?? DEFAULT_SHAPES;

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
  }, [clearHighlights, setHighlightingActive]);

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
    setShape,
    operation: mode?.operation ?? "add",
    setOperation,
    monochrome,
    colorForOperation,
    setCircleRadius,
    setRectSize,
  };
};
