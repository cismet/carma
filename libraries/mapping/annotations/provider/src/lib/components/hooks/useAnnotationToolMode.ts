import { useEffect, useState } from "react";
import {
  SELECT_TOOL_TYPE,
  SPATIAL_MARKUP_KIND_AREA,
  SPATIAL_MARKUP_KIND_DISTANCE,
  SPATIAL_MARKUP_KIND_LABEL,
  SPATIAL_MARKUP_KIND_PLANAR,
  SPATIAL_MARKUP_KIND_POINT,
  SPATIAL_MARKUP_KIND_POLYLINE,
  SPATIAL_MARKUP_KIND_VERTICAL,
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

interface UseAnnotationToolModeProps {
  isSelectionMode: boolean;
  isLabelMode: boolean;
  isDistanceMode: boolean;
  isAreaMode: boolean;
  isVerticalMode: boolean;
  isPlanarMode: boolean;
  isPolylineMode: boolean;
  onSelectMode: () => void;
  onLabelMode: () => void;
  onPointMode: () => void;
  onDistanceMode: () => void;
  onAreaMode: () => void;
  onVerticalMode: () => void;
  onPlanarMode: () => void;
  onPolylineMode: () => void;
}

const resolveToolType = ({
  isSelectionMode,
  isLabelMode,
  isDistanceMode,
  isAreaMode,
  isVerticalMode,
  isPlanarMode,
  isPolylineMode,
}: Pick<
  UseAnnotationToolModeProps,
  | "isSelectionMode"
  | "isLabelMode"
  | "isDistanceMode"
  | "isAreaMode"
  | "isVerticalMode"
  | "isPlanarMode"
  | "isPolylineMode"
>): AnnotationToolType => {
  if (isSelectionMode) return SELECT_TOOL_TYPE;
  if (isLabelMode) return SPATIAL_MARKUP_KIND_LABEL;
  if (isDistanceMode) return SPATIAL_MARKUP_KIND_DISTANCE;
  if (isAreaMode) return SPATIAL_MARKUP_KIND_AREA;
  if (isVerticalMode) return SPATIAL_MARKUP_KIND_VERTICAL;
  if (isPlanarMode) return SPATIAL_MARKUP_KIND_PLANAR;
  if (isPolylineMode) return SPATIAL_MARKUP_KIND_POLYLINE;
  return SPATIAL_MARKUP_KIND_POINT;
};

export const useAnnotationToolMode = ({
  isSelectionMode,
  isLabelMode,
  isDistanceMode,
  isAreaMode,
  isVerticalMode,
  isPlanarMode,
  isPolylineMode,
  onSelectMode,
  onLabelMode,
  onPointMode,
  onDistanceMode,
  onAreaMode,
  onVerticalMode,
  onPlanarMode,
  onPolylineMode,
}: UseAnnotationToolModeProps) => {
  const initialToolType = resolveToolType({
    isSelectionMode,
    isLabelMode,
    isDistanceMode,
    isAreaMode,
    isVerticalMode,
    isPlanarMode,
    isPolylineMode,
  });

  const [lastNonSelectionToolType, setLastNonSelectionToolType] =
    useState<AnnotationToolType>(
      initialToolType === SELECT_TOOL_TYPE
        ? SPATIAL_MARKUP_KIND_POINT
        : initialToolType
    );
  const [activeToolType, setActiveToolType] =
    useState<AnnotationToolType>(initialToolType);

  const triggerToolCallback = (toolType: AnnotationToolType) => {
    logToolDebug("trigger-callback", { toolType });
    switch (toolType) {
      case SELECT_TOOL_TYPE:
        return onSelectMode();
      case SPATIAL_MARKUP_KIND_LABEL:
        return onLabelMode();
      case SPATIAL_MARKUP_KIND_POINT:
        return onPointMode();
      case SPATIAL_MARKUP_KIND_DISTANCE:
        return onDistanceMode();
      case SPATIAL_MARKUP_KIND_POLYLINE:
        return onPolylineMode();
      case SPATIAL_MARKUP_KIND_AREA:
        return onAreaMode();
      case SPATIAL_MARKUP_KIND_VERTICAL:
        return onVerticalMode();
      case SPATIAL_MARKUP_KIND_PLANAR:
        return onPlanarMode();
    }
  };

  useEffect(() => {
    const resolved = resolveToolType({
      isSelectionMode,
      isLabelMode,
      isDistanceMode,
      isAreaMode,
      isVerticalMode,
      isPlanarMode,
      isPolylineMode,
    });
    logToolDebug("sync-from-flags", {
      resolvedToolType: resolved,
      flags: {
        isSelectionMode,
        isLabelMode,
        isDistanceMode,
        isAreaMode,
        isVerticalMode,
        isPlanarMode,
        isPolylineMode,
      },
    });
    setActiveToolType(resolved);
    if (resolved !== SELECT_TOOL_TYPE) {
      setLastNonSelectionToolType(resolved);
    }
  }, [
    isSelectionMode,
    isLabelMode,
    isDistanceMode,
    isAreaMode,
    isVerticalMode,
    isPlanarMode,
    isPolylineMode,
  ]);

  const handleToolTypeChange = (toolType: AnnotationToolType) => {
    logToolDebug("tool-change-request", {
      requestedToolType: toolType,
      activeToolType,
      lastNonSelectionToolType,
    });
    if (toolType === activeToolType && toolType !== SELECT_TOOL_TYPE) {
      setLastNonSelectionToolType(toolType);
      setActiveToolType(SELECT_TOOL_TYPE);
      logToolDebug("tool-change-branch", {
        branch: "active-non-select-clicked-switch-to-select",
        nextToolType: SELECT_TOOL_TYPE,
      });
      triggerToolCallback(SELECT_TOOL_TYPE);
      return;
    }

    if (toolType === SELECT_TOOL_TYPE && activeToolType === SELECT_TOOL_TYPE) {
      setActiveToolType(lastNonSelectionToolType);
      logToolDebug("tool-change-branch", {
        branch: "select-clicked-while-select-active-restore-last-non-select",
        nextToolType: lastNonSelectionToolType,
      });
      triggerToolCallback(lastNonSelectionToolType);
      return;
    }

    if (toolType === SELECT_TOOL_TYPE) {
      setLastNonSelectionToolType((prev) =>
        activeToolType === SELECT_TOOL_TYPE ? prev : activeToolType
      );
      setActiveToolType(SELECT_TOOL_TYPE);
      logToolDebug("tool-change-branch", {
        branch: "switch-to-select",
        nextToolType: SELECT_TOOL_TYPE,
      });
      triggerToolCallback(SELECT_TOOL_TYPE);
      return;
    }

    setLastNonSelectionToolType(toolType);
    setActiveToolType(toolType);
    logToolDebug("tool-change-branch", {
      branch: "switch-to-requested-tool",
      nextToolType: toolType,
    });
    triggerToolCallback(toolType);
  };

  return {
    activeToolType,
    handleToolTypeChange,
  };
};
