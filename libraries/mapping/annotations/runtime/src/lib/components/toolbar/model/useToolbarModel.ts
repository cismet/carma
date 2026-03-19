import { useCallback, useEffect, useMemo } from "react";
import { Modal } from "antd";
import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  isKeyboardTargetEditable,
  isPointAnnotationEntry,
  isPointMeasurementEntry,
} from "@carma-mapping/annotations/core";
import type { AnnotationToolManager } from "../annotationToolManager";
import {
  useCollection,
  useSelectionState,
  useSettings,
  useTools,
} from "../../../store";
import { useNodeChainAnnotations } from "../../../annotation-entries/hooks/useNodeChainAnnotationReadModel";
import { useToolbarToolMode } from "./useToolbarToolMode";
import type { AnnotationModeToolbarProps } from "../AnnotationModeToolbar.types";
import type { CSSProperties } from "react";

type UseToolbarModelOptions = {
  pixelWidth?: number;
  toolManager?: AnnotationToolManager;
  showPrimaryToolbar?: boolean;
  showSecondaryToolbar?: boolean;
  enableMultiDeleteHotkey?: boolean;
  secondaryToolbarContainerStyle?: CSSProperties;
  secondaryToolbarCollapsedByDefault?: boolean;
  secondaryToolbarDirection?: "down" | "right";
};

const findProtectedPolygonCandidateNodeIds = (
  selectedPointIds: ReadonlySet<string>,
  nodeChainAnnotations: ReturnType<typeof useNodeChainAnnotations>
): string[] | null => {
  const protectedPolygonCandidate = nodeChainAnnotations.find((group) => {
    if (!group.closed || group.nodeIds.length > 3) {
      return false;
    }
    const nodeIds = group.nodeIds.filter((nodeId): nodeId is string =>
      Boolean(nodeId)
    );
    if (nodeIds.length === 0) {
      return false;
    }
    const includesAnyNode = nodeIds.some((nodeId) =>
      selectedPointIds.has(nodeId)
    );
    if (!includesAnyNode) {
      return false;
    }
    const includesAllNodes = nodeIds.every((nodeId) =>
      selectedPointIds.has(nodeId)
    );
    return !includesAllNodes;
  });

  return protectedPolygonCandidate?.nodeIds ?? null;
};

export const useToolbarModel = ({
  pixelWidth = 350,
  toolManager,
  showPrimaryToolbar = true,
  showSecondaryToolbar = true,
  enableMultiDeleteHotkey = true,
  secondaryToolbarContainerStyle,
  secondaryToolbarCollapsedByDefault = false,
  secondaryToolbarDirection = "down",
}: UseToolbarModelOptions = {}): AnnotationModeToolbarProps => {
  const tools = useTools();
  const selection = useSelectionState();
  const annotations = useCollection();
  const settings = useSettings();
  const nodeChainAnnotations = useNodeChainAnnotations();
  const pointSettings = settings.get(ANNOTATION_TYPE_POINT);
  const distanceSettings = settings.get(ANNOTATION_TYPE_DISTANCE);
  const polylineSettings = settings.get(ANNOTATION_TYPE_POLYLINE);

  const measurementById = useMemo(
    () =>
      new Map(
        annotations.items.map((measurement) => [measurement.id, measurement])
      ),
    [annotations.items]
  );

  const selectedPointIds = useMemo(
    () =>
      selection.ids.filter((id) => {
        const annotation = measurementById.get(id);
        return Boolean(annotation && isPointAnnotationEntry(annotation));
      }),
    [measurementById, selection.ids]
  );

  const deletableSelectedPointIds = useMemo(
    () =>
      selectedPointIds.filter((id) => {
        const annotation = measurementById.get(id);
        return Boolean(annotation && !annotation.locked);
      }),
    [measurementById, selectedPointIds]
  );

  const selectedMeasurementCount = useMemo(
    () =>
      selectedPointIds.filter((id) => {
        const annotation = measurementById.get(id);
        return Boolean(
          annotation &&
            isPointMeasurementEntry(annotation) &&
            !annotation.auxiliaryLabelAnchor
        );
      }).length,
    [measurementById, selectedPointIds]
  );

  const selectedLabelCount = useMemo(
    () =>
      selectedPointIds.filter((id) => {
        const annotation = measurementById.get(id);
        return Boolean(
          annotation &&
            isPointMeasurementEntry(annotation) &&
            annotation.auxiliaryLabelAnchor
        );
      }).length,
    [measurementById, selectedPointIds]
  );

  const selectedVisibilityHidden =
    selectedPointIds.length > 0 &&
    selectedPointIds.every((id) => Boolean(measurementById.get(id)?.hidden));
  const selectedLocked =
    selectedPointIds.length > 0 &&
    selectedPointIds.every((id) => Boolean(measurementById.get(id)?.locked));
  const deletableSelectedPointCount = deletableSelectedPointIds.length;
  const hasDeletableSelection = deletableSelectedPointCount > 0;
  const hasAnyAnnotations =
    annotations.items.length > 0 || nodeChainAnnotations.length > 0;

  const toggleSelectedVisibility = useCallback(() => {
    if (selectedPointIds.length === 0) return;
    annotations.toggleVisibilityByIds(selectedPointIds);
  }, [annotations, selectedPointIds]);

  const toggleSelectedLock = useCallback(() => {
    if (selectedPointIds.length === 0) return;
    annotations.toggleLockByIds(selectedPointIds);
  }, [annotations, selectedPointIds]);

  const requestDeleteSelected = useCallback(() => {
    const protectedPolygonNodeIds = findProtectedPolygonCandidateNodeIds(
      new Set(deletableSelectedPointIds),
      nodeChainAnnotations
    );

    if (protectedPolygonNodeIds) {
      Modal.confirm({
        centered: true,
        title: "Polygon löschen?",
        content:
          "Ein einzelner Knoten kann bei Polygonen mit 3 oder weniger Punkten nicht gelöscht werden. Soll stattdessen das gesamte Polygon gelöscht werden?",
        okText: "Polygon löschen",
        cancelText: "Abbrechen",
        okButtonProps: { danger: true },
        onOk: () => {
          annotations.removeByIds(protectedPolygonNodeIds);
        },
      });
      return;
    }

    if (deletableSelectedPointCount > 1) {
      Modal.confirm({
        centered: true,
        title: "Mehrere Messungen löschen",
        content: `${deletableSelectedPointCount} ausgewählte Messungen wirklich löschen?`,
        okText: "Löschen",
        cancelText: "Abbrechen",
        okButtonProps: { danger: true },
        onOk: () => {
          annotations.removeSelection();
        },
      });
      return;
    }

    annotations.removeSelection();
  }, [
    annotations,
    deletableSelectedPointCount,
    deletableSelectedPointIds,
    nodeChainAnnotations,
  ]);

  const requestClearAll = useCallback(() => {
    if (!hasAnyAnnotations) return;

    Modal.confirm({
      centered: true,
      title: "Alle Messungen löschen",
      content:
        "Alle vorhandenen Messungen wirklich löschen? Dieser Schritt kann nicht rueckgaengig gemacht werden.",
      okText: "Alle löschen",
      cancelText: "Abbrechen",
      okButtonProps: { danger: true },
      onOk: () => {
        annotations.removeAll();
      },
    });
  }, [annotations, hasAnyAnnotations]);

  useEffect(() => {
    if (!enableMultiDeleteHotkey) return;

    const handleMultiDeleteKey = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isKeyboardTargetEditable(event.target)) return;
      if (deletableSelectedPointCount <= 1) return;

      event.preventDefault();
      event.stopPropagation();
      requestDeleteSelected();
    };

    window.addEventListener("keydown", handleMultiDeleteKey, true);
    return () => {
      window.removeEventListener("keydown", handleMultiDeleteKey, true);
    };
  }, [
    deletableSelectedPointCount,
    enableMultiDeleteHotkey,
    requestDeleteSelected,
  ]);

  const { activeToolType, handleToolTypeChange } = useToolbarToolMode(
    tools.activeToolType,
    tools.requestModeChange
  );

  const handleDistanceLineVisibilityChange = useCallback(
    (kind: "direct" | "vertical" | "horizontal", visible: boolean) => {
      settings.update(ANNOTATION_TYPE_DISTANCE, {
        creationLineVisibility: { [kind]: visible },
      });
    },
    [settings]
  );

  return {
    activeToolType,
    onToolTypeChange: handleToolTypeChange,
    layout: {
      pixelWidth,
      showPrimaryToolbar,
      showSecondaryToolbar,
      secondaryToolbarContainerStyle,
      secondaryToolbarCollapsedByDefault,
      secondaryToolbarDirection,
    },
    selection: {
      additiveMode: selection.mode.additive,
      onAdditiveModeChange: selection.setAdditiveMode,
      rectangleMode: selection.mode.rectangle,
      onRectangleModeChange: selection.setRectangleMode,
      selectedMeasurementCount,
      selectedLabelCount,
      hasAnyAnnotations,
      hasDeletableSelection,
      selectedVisibilityHidden,
      selectedLocked,
      onClearAll: requestClearAll,
      onDeleteSelected: requestDeleteSelected,
      onToggleSelectedVisibility: toggleSelectedVisibility,
      onToggleSelectedLock: toggleSelectedLock,
    },
    distance: {
      lineVisibility: distanceSettings.creationLineVisibility,
      onLineVisibilityChange: handleDistanceLineVisibilityChange,
      stickyToFirstPoint: distanceSettings.stickyToFirstPoint,
      onStickyToFirstPointChange: (enabled) =>
        settings.update(ANNOTATION_TYPE_DISTANCE, {
          stickyToFirstPoint: enabled,
        }),
    },
    point: {
      verticalOffsetMeters: pointSettings.verticalOffsetMeters,
      onVerticalOffsetChange: (offsetMeters) =>
        settings.update(ANNOTATION_TYPE_POINT, {
          verticalOffsetMeters: offsetMeters,
        }),
      soloMode: pointSettings.temporaryMode,
      onSoloModeChange: (temporaryMode) =>
        settings.update(ANNOTATION_TYPE_POINT, { temporaryMode }),
    },
    polyline: {
      verticalOffsetMeters: polylineSettings.verticalOffsetMeters,
      onVerticalOffsetChange: (offsetMeters) =>
        settings.update(ANNOTATION_TYPE_POLYLINE, {
          verticalOffsetMeters: offsetMeters,
        }),
      segmentLineMode: polylineSettings.segmentLineMode,
      onSegmentLineModeChange: (segmentLineMode) =>
        settings.update(ANNOTATION_TYPE_POLYLINE, { segmentLineMode }),
    },
    toolCatalog: {
      manager: toolManager,
    },
  };
};
