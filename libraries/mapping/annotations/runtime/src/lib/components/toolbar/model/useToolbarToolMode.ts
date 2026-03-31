import { useEffect, useState } from "react";

import {
  SELECT_TOOL_TYPE,
  ANNOTATION_TYPE_POINT,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";
const TOOL_DEBUG_STORAGE_KEY = "carma.annotations.debug.toolChanges";
const TOOL_DEBUG_GLOBAL_KEY = "__CARMA_ANNOTATIONS_DEBUG_TOOL_CHANGES__";

const isToolDebugEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  const win = window as Window & {
    [TOOL_DEBUG_GLOBAL_KEY]?: unknown;
  };
  if (Boolean(win[TOOL_DEBUG_GLOBAL_KEY])) return true;
  try {
    return window.localStorage.getItem(TOOL_DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const logToolDebug = (event: string, payload: Record<string, unknown>) => {
  if (!isToolDebugEnabled()) return;
  console.debug(`[AnnotationTools] ${event}`, payload);
};

export const useToolbarToolMode = (
  activeToolType: AnnotationToolType,
  onToolTypeChange: (toolType: AnnotationToolType) => void
) => {
  const [lastNonSelectionToolType, setLastNonSelectionToolType] =
    useState<AnnotationToolType>(
      activeToolType === SELECT_TOOL_TYPE
        ? ANNOTATION_TYPE_POINT
        : activeToolType
    );

  useEffect(() => {
    logToolDebug("sync-from-flags", {
      activeToolType,
    });
    if (activeToolType !== SELECT_TOOL_TYPE) {
      setLastNonSelectionToolType(activeToolType);
    }
  }, [activeToolType]);

  const handleToolTypeChange = (toolType: AnnotationToolType) => {
    logToolDebug("tool-change-request", {
      requestedToolType: toolType,
      activeToolType,
      lastNonSelectionToolType,
    });
    if (toolType === activeToolType && toolType !== SELECT_TOOL_TYPE) {
      setLastNonSelectionToolType(toolType);
      logToolDebug("tool-change-branch", {
        branch: "active-non-select-clicked-switch-to-select",
        nextToolType: SELECT_TOOL_TYPE,
      });
      onToolTypeChange(SELECT_TOOL_TYPE);
      return;
    }

    if (toolType === SELECT_TOOL_TYPE && activeToolType === SELECT_TOOL_TYPE) {
      logToolDebug("tool-change-branch", {
        branch: "select-clicked-while-select-active-restore-last-non-select",
        nextToolType: lastNonSelectionToolType,
      });
      onToolTypeChange(lastNonSelectionToolType);
      return;
    }

    if (toolType === SELECT_TOOL_TYPE) {
      setLastNonSelectionToolType((prev) =>
        activeToolType === SELECT_TOOL_TYPE ? prev : activeToolType
      );
      logToolDebug("tool-change-branch", {
        branch: "switch-to-select",
        nextToolType: SELECT_TOOL_TYPE,
      });
      onToolTypeChange(SELECT_TOOL_TYPE);
      return;
    }

    setLastNonSelectionToolType(toolType);
    logToolDebug("tool-change-branch", {
      branch: "switch-to-requested-tool",
      nextToolType: toolType,
    });
    onToolTypeChange(toolType);
  };

  return {
    activeToolType,
    handleToolTypeChange,
  };
};
