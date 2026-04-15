import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ANNOTATION_TOOL_TYPES } from "@carma-mapping/annotations/core";
import { useToolbarToolMode } from "./use-toolbar-tool-mode";
const {
  DISTANCE: ANNOTATION_TYPE_DISTANCE,
  POINT: ANNOTATION_TYPE_POINT,
  SELECT: SELECT_TOOL_TYPE,
} = ANNOTATION_TOOL_TYPES;

describe("useToolbarToolMode", () => {
  it("switches to select when the active non-select tool is clicked again", () => {
    const onToolTypeChange = vi.fn();

    const { result } = renderHook(() =>
      useToolbarToolMode(ANNOTATION_TYPE_POINT, onToolTypeChange)
    );

    act(() => {
      result.current.handleToolTypeChange(ANNOTATION_TYPE_POINT);
    });

    expect(onToolTypeChange).toHaveBeenCalledWith(SELECT_TOOL_TYPE);
  });

  it("restores the last non-select tool when select is clicked twice", () => {
    const onToolTypeChange = vi.fn();

    const { result, rerender } = renderHook(
      ({ activeToolType }) =>
        useToolbarToolMode(activeToolType, onToolTypeChange),
      {
        initialProps: { activeToolType: ANNOTATION_TYPE_DISTANCE },
      }
    );

    act(() => {
      result.current.handleToolTypeChange(SELECT_TOOL_TYPE);
    });

    rerender({ activeToolType: SELECT_TOOL_TYPE });

    act(() => {
      result.current.handleToolTypeChange(SELECT_TOOL_TYPE);
    });

    expect(onToolTypeChange).toHaveBeenNthCalledWith(1, SELECT_TOOL_TYPE);
    expect(onToolTypeChange).toHaveBeenNthCalledWith(
      2,
      ANNOTATION_TYPE_DISTANCE
    );
  });
});
